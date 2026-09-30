use std::time::Duration;

use serde_json::{json, Value};
use vrcx_0_application_core::{FriendProjectionPatch, FriendStateBucketAuthority};
use vrcx_0_contracts::feed_live::FeedLiveEntry;
use vrcx_0_contracts::realtime::FriendLogDelete;
use vrcx_0_core::derived_keys;
use vrcx_0_core::files::extract_file_id;
use vrcx_0_core::friends::FriendRecord;
use vrcx_0_core::trust::{trust_level_changed, trust_level_differs};
use vrcx_0_core::OwnerId;

use crate::realtime::event_kind::RealtimeWsEventKind;
use crate::realtime::friends::presence::{
    dwell_place, presence_feed, reduce, Claim, Evidence, OnlineState, Phase, Source,
    WsPresenceEvent,
};
use crate::realtime::{FriendIconChange, FriendWake, RealtimeFriendOutput};

use super::persistence::{
    add_profile_diff_feed_entries, display_name, friend_log_upsert, friend_relationship_feed_entry,
    meaningful_name, meaningful_record_name, trust_level_feed_entry, FriendRelationshipFeedKind,
};
use super::presence_projection::{project_presence, strip_presence_keys};
use super::state::{FriendEntry, RealtimeFriendState};
use super::utils::{first_owned, EventTime, JsonExt};

mod event_split;
mod patch_builders;
mod record_transition;

use event_split::{profile_patch, EventSource};
#[cfg(test)]
use patch_builders::event_user_patch;
use patch_builders::{event_user_id, normalize_patch_trust};
pub(super) use record_transition::{merge_profile, record_string};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum FriendEventKind {
    Add,
    Delete,
    Update,
    Online,
    Active,
    Offline,
    Location,
}

impl FriendEventKind {
    pub(super) fn from_ws_event_kind(event_kind: &RealtimeWsEventKind) -> Option<Self> {
        match event_kind {
            RealtimeWsEventKind::FriendAdd => Some(Self::Add),
            RealtimeWsEventKind::FriendDelete => Some(Self::Delete),
            RealtimeWsEventKind::FriendUpdate => Some(Self::Update),
            RealtimeWsEventKind::FriendOnline => Some(Self::Online),
            RealtimeWsEventKind::FriendActive => Some(Self::Active),
            RealtimeWsEventKind::FriendOffline => Some(Self::Offline),
            RealtimeWsEventKind::FriendLocation => Some(Self::Location),
            _ => None,
        }
    }
}

pub fn is_friend_event_type(message_type: &str) -> bool {
    RealtimeWsEventKind::from_name(message_type).is_friend()
}

pub(super) fn apply_friend_event(
    state: &mut RealtimeFriendState,
    event_kind: FriendEventKind,
    content: &Value,
    now: &EventTime,
) -> Option<RealtimeFriendOutput> {
    apply_friend_event_with_source(state, event_kind, content, now, EventSource::Websocket)
}

pub(super) fn apply_refetched_friend_profile_event(
    state: &mut RealtimeFriendState,
    content: &Value,
    now: &EventTime,
) -> Option<RealtimeFriendOutput> {
    apply_friend_event_with_source(
        state,
        FriendEventKind::Update,
        content,
        now,
        EventSource::ApiProfile,
    )
}

pub(super) fn apply_trusted_friend_add_event(
    state: &mut RealtimeFriendState,
    content: &Value,
    now: &EventTime,
) -> Option<RealtimeFriendOutput> {
    apply_friend_event_with_source(
        state,
        FriendEventKind::Add,
        content,
        now,
        EventSource::TrustedFriendAdd,
    )
}

pub(super) fn apply_presence_evidence(
    state: &mut RealtimeFriendState,
    user_id: &str,
    evidence: &Evidence,
    now: &EventTime,
) -> Option<RealtimeFriendOutput> {
    let mut output = new_output(state)?;
    let previous = state.entry(user_id)?.clone();
    let step = reduce(&previous.presence, evidence, now.timestamp_ms);
    if step.next == previous.presence && step.wake_at_ms.is_none() {
        return None;
    }
    push_feed(
        &mut output,
        presence_feed(
            user_id,
            &previous.record,
            &previous.presence,
            &step.next,
            now.timestamp_ms,
            &now.iso,
        ),
    );
    arm_wake(&mut output, user_id, step.wake_at_ms, now);
    commit(
        state,
        &mut output,
        user_id,
        FriendEntry {
            record: previous.record,
            presence: step.next,
        },
    );
    Some(finish(output))
}

fn apply_friend_event_with_source(
    state: &mut RealtimeFriendState,
    event_kind: FriendEventKind,
    content: &Value,
    now: &EventTime,
    source: EventSource,
) -> Option<RealtimeFriendOutput> {
    let mut output = new_output(state)?;
    match event_kind {
        FriendEventKind::Delete => apply_delete(state, &mut output, content, now)?,
        _ => apply_change(state, &mut output, event_kind, content, now, source)?,
    }
    Some(finish(output))
}

fn new_output(state: &RealtimeFriendState) -> Option<RealtimeFriendOutput> {
    let roster = state.roster.as_ref()?;
    Some(RealtimeFriendOutput::new(
        OwnerId::new(roster.current_user_id.clone()),
        roster.generation,
        roster.baseline_revision,
    ))
}

fn finish(mut output: RealtimeFriendOutput) -> RealtimeFriendOutput {
    let mut feed_entries = output.persistence.feed_entries.clone();
    feed_entries.append(&mut output.projection.feed_entries);
    output.projection.feed_entries = feed_entries;
    output
}

fn evidence_for(event_kind: FriendEventKind, content: &Value, source: EventSource) -> Evidence {
    let user = content.get("user").unwrap_or(&Value::Null);
    match (event_kind, source) {
        (_, EventSource::ApiProfile) => Evidence::from_profile(Source::Api, user),
        (_, EventSource::TrustedFriendAdd) => Evidence::from_profile(Source::TrustedAdd, user),
        (FriendEventKind::Online, _) => Evidence::from_ws(WsPresenceEvent::Online, content),
        (FriendEventKind::Active, _) => Evidence::from_ws(WsPresenceEvent::Active, content),
        (FriendEventKind::Offline, _) => Evidence::from_ws(WsPresenceEvent::Offline, content),
        (FriendEventKind::Location, _) => Evidence::from_ws(WsPresenceEvent::Location, content),
        (FriendEventKind::Update, _) => Evidence::from_ws(WsPresenceEvent::Update, content),
        (FriendEventKind::Add | FriendEventKind::Delete, _) => {
            Evidence::new(Source::Ws, Claim::Nothing)
        }
    }
}

fn apply_change(
    state: &mut RealtimeFriendState,
    output: &mut RealtimeFriendOutput,
    event_kind: FriendEventKind,
    content: &Value,
    now: &EventTime,
    source: EventSource,
) -> Option<()> {
    let user_id = event_user_id(content)?;
    let mut patch = profile_patch(content, &user_id);
    strip_presence_keys(&mut patch);
    let evidence = evidence_for(event_kind, content, source);
    let previous = state.entry(&user_id).cloned();
    if event_kind == FriendEventKind::Update
        && source == EventSource::Websocket
        && evidence.claim == Claim::Nothing
        && patch.as_object().map_or(0, |object| object.len()) <= 1
    {
        return None;
    }
    normalize_patch_trust(&mut patch, previous.as_ref().map(|entry| &entry.record));
    let Some(previous) = previous else {
        return create_entry(state, output, event_kind, &user_id, &patch, &evidence, now);
    };
    let record = merge_profile(Some(&previous.record), &user_id, &patch);
    let step = reduce(&previous.presence, &evidence, now.timestamp_ms);
    let feeds = presence_feed(
        &user_id,
        &record,
        &previous.presence,
        &step.next,
        now.timestamp_ms,
        &now.iso,
    );
    let mut projected = record.clone();
    project_presence(&mut projected, &step.next);
    if event_kind != FriendEventKind::Add
        && projected == previous.record
        && step.wake_at_ms.is_none()
        && !step.refetch
        && feeds.is_empty()
    {
        if let Some(entry) = state
            .roster
            .as_mut()
            .and_then(|roster| roster.entries.get_mut(&user_id))
        {
            entry.presence = step.next;
        }
        return None;
    }
    record_profile_identity_change(output, &user_id, &patch, &previous.record, &step.next, now);
    push_feed(output, feeds);
    if event_kind == FriendEventKind::Update && source == EventSource::Websocket {
        add_profile_diff_feed_entries(output, &user_id, &patch, Some(&previous.record), &now.iso);
        if let Some(change) = friend_icon_change(&user_id, &patch, &previous.record, &now.iso) {
            output.icon_changes.push(change);
        }
    }
    arm_wake(output, &user_id, step.wake_at_ms, now);
    if step.refetch {
        push_profile_refetch_user_id(output, &user_id);
    }
    commit(
        state,
        output,
        &user_id,
        FriendEntry {
            record: projected,
            presence: step.next,
        },
    );
    Some(())
}

fn create_entry(
    state: &mut RealtimeFriendState,
    output: &mut RealtimeFriendOutput,
    event_kind: FriendEventKind,
    user_id: &str,
    patch: &Value,
    evidence: &Evidence,
    now: &EventTime,
) -> Option<()> {
    let presence = match &evidence.claim {
        Claim::Online { place, platform } => Phase::Online(OnlineState::arrive(
            place.clone(),
            platform.clone(),
            now.timestamp_ms,
            true,
        )),
        _ if event_kind == FriendEventKind::Location => return None,
        Claim::Active { platform } => Phase::Active {
            changed_ms: None,
            platform: platform.clone(),
        },
        _ => Phase::offline(),
    };
    if event_kind == FriendEventKind::Add {
        output
            .persistence
            .friend_log_upserts
            .push(friend_log_upsert(
                user_id,
                patch,
                None,
                section_bucket(&presence),
                &now.iso,
            ));
        output
            .persistence
            .feed_entries
            .push(friend_relationship_feed_entry(
                FriendRelationshipFeedKind::Friend,
                user_id,
                patch,
                None,
                &now.iso,
            ));
        output.projection.friend_log_changed = true;
    }
    let record = merge_profile(None, user_id, patch);
    output.projection.feed_entries.extend(
        presence_feed(
            user_id,
            &record,
            &Phase::offline(),
            &presence,
            now.timestamp_ms,
            &now.iso,
        )
        .into_iter()
        .filter(|entry| matches!(entry, FeedLiveEntry::OnPlayerJoining { .. })),
    );
    commit(state, output, user_id, FriendEntry { record, presence });
    Some(())
}

fn apply_delete(
    state: &mut RealtimeFriendState,
    output: &mut RealtimeFriendOutput,
    content: &Value,
    now: &EventTime,
) -> Option<()> {
    let user_id = event_user_id(content)?;
    let removed = state
        .roster
        .as_mut()
        .and_then(|roster| roster.entries.remove(&user_id));
    if removed.is_some() {
        state.invalidate_friend_user_ids_snapshot();
    }
    output.projection.removals.push(user_id.clone());
    output.persistence.friend_log_deletes.push(FriendLogDelete {
        target_user_id: user_id.clone(),
        created_at: now.iso.clone(),
    });
    if let Some(previous) = removed.as_ref() {
        output
            .persistence
            .feed_entries
            .push(friend_relationship_feed_entry(
                FriendRelationshipFeedKind::Unfriend,
                &user_id,
                &json!({ "id": user_id.clone() }),
                Some(&previous.record),
                &now.iso,
            ));
    }
    output.projection.friend_log_changed = true;
    output.projection.location_time_snapshot = state.instance_dwell.forget_friend(&user_id);
    Some(())
}

fn push_feed(output: &mut RealtimeFriendOutput, entries: Vec<FeedLiveEntry>) {
    for entry in entries {
        match entry {
            FeedLiveEntry::OnPlayerJoining { .. } => output.projection.feed_entries.push(entry),
            _ => output.persistence.feed_entries.push(entry),
        }
    }
}

fn arm_wake(
    output: &mut RealtimeFriendOutput,
    user_id: &str,
    wake_at_ms: Option<i64>,
    now: &EventTime,
) {
    if let Some(wake_at_ms) = wake_at_ms {
        let delay_ms = u64::try_from(wake_at_ms - now.timestamp_ms).unwrap_or(0);
        output.wake = Some(FriendWake {
            user_id: user_id.to_string(),
            delay: Duration::from_millis(delay_ms),
        });
    }
}

fn commit(
    state: &mut RealtimeFriendState,
    output: &mut RealtimeFriendOutput,
    user_id: &str,
    mut entry: FriendEntry,
) {
    project_presence(&mut entry.record, &entry.presence);
    if let Some(snapshot) = state
        .instance_dwell
        .observe_friend(user_id, &dwell_place(&entry.presence))
    {
        output.projection.location_time_snapshot = Some(snapshot);
    }
    output.projection.patches.push(FriendProjectionPatch {
        user_id: user_id.to_string(),
        patch: entry.record.clone(),
        state_bucket_authority: FriendStateBucketAuthority::Explicit,
    });
    let added = state
        .roster
        .as_mut()
        .is_some_and(|roster| roster.entries.insert(user_id.to_string(), entry).is_none());
    if added {
        state.invalidate_friend_user_ids_snapshot();
    }
}

pub(super) fn section_bucket(phase: &Phase) -> &'static str {
    match phase {
        Phase::Online(_) | Phase::PendingOffline { .. } => "online",
        Phase::Active { .. } => "active",
        Phase::Offline { .. } => "offline",
    }
}

fn friend_icon_change(
    user_id: &str,
    patch: &Value,
    previous: &FriendRecord,
    created_at: &str,
) -> Option<FriendIconChange> {
    let next_icon_url = patch.trimmed_field("iconUrl")?;
    if next_icon_url == previous.icon_url
        || extract_file_id(next_icon_url)? == extract_file_id(&previous.icon_url)?
    {
        return None;
    }
    Some(FriendIconChange {
        user_id: user_id.to_string(),
        display_name: display_name(user_id, patch, Some(previous)),
        previous_icon_url: previous.icon_url.clone(),
        next_icon_url: next_icon_url.to_string(),
        created_at: created_at.to_string(),
    })
}

fn push_profile_refetch_user_id(output: &mut RealtimeFriendOutput, user_id: &str) {
    if output
        .profile_refetch_user_ids
        .iter()
        .any(|existing_id| existing_id == user_id)
    {
        return;
    }
    output.profile_refetch_user_ids.push(user_id.to_string());
}

fn record_profile_identity_change(
    output: &mut RealtimeFriendOutput,
    user_id: &str,
    patch: &Value,
    previous: &FriendRecord,
    next: &Phase,
    now: &EventTime,
) {
    let next_name = meaningful_name(patch, user_id);
    let name_changed =
        !next_name.is_empty() && next_name != meaningful_record_name(previous, user_id);
    let previous_trust_level = record_string(previous, derived_keys::TRUST_LEVEL);
    let trust_level = first_owned([
        patch.text_field(derived_keys::TRUST_LEVEL),
        previous_trust_level.clone(),
    ]);
    let trust_differs = trust_level_differs(&previous_trust_level, &trust_level);
    let trust_changed = trust_level_changed(&previous_trust_level, &trust_level);
    if !name_changed && !trust_differs {
        return;
    }
    let upsert = friend_log_upsert(
        user_id,
        patch,
        Some(previous),
        section_bucket(next),
        &now.iso,
    );
    if trust_changed {
        output.persistence.feed_entries.push(trust_level_feed_entry(
            &now.iso,
            user_id,
            &upsert.display_name,
            &trust_level,
            &previous_trust_level,
            upsert.friend_number,
        ));
    }
    output.persistence.friend_log_upserts.push(upsert);
    output.projection.friend_log_changed = true;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn event_user_patch_strips_embedded_state() {
        let content = json!({
            "userId": "usr_friend",
            "user": {
                "id": "usr_friend",
                "displayName": "Friend",
                "state": "online"
            }
        });

        let patch = event_user_patch(&content, "usr_friend").expect("user patch");
        assert_eq!(patch["id"], json!("usr_friend"));
        assert_eq!(patch["displayName"], json!("Friend"));
        assert!(patch.get("state").is_none());
    }
}
