use std::time::Duration;

use vrcx_0_contracts::feed_live::FeedLiveEntry;
use vrcx_0_contracts::realtime::RealtimePersistenceBatch;

use super::projection::{
    FriendProjection, RealtimeCurrentUserProjection, RealtimeInstanceClosedProjection,
    RealtimeNotificationProjection,
};
use vrcx_0_core::OwnerId;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FriendIconChange {
    pub user_id: String,
    pub display_name: String,
    pub previous_icon_url: String,
    pub next_icon_url: String,
    pub created_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WakeDeadline {
    pub at_ms: i64,
    pub delay: Duration,
}

impl WakeDeadline {
    pub(crate) fn new(at_ms: i64, now_ms: i64) -> Self {
        Self {
            at_ms,
            delay: Duration::from_millis(u64::try_from(at_ms - now_ms).unwrap_or(0)),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FriendWake {
    pub user_id: String,
    pub deadline: WakeDeadline,
}

impl FriendWake {
    pub(crate) fn at(user_id: &str, wake_at_ms: i64, now_ms: i64) -> Self {
        Self {
            user_id: user_id.to_string(),
            deadline: WakeDeadline::new(wake_at_ms, now_ms),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct RealtimeFriendOutput {
    pub owner_user_id: OwnerId,
    pub projection: FriendProjection,
    pub persistence: RealtimePersistenceBatch,
    pub joining: Vec<FeedLiveEntry>,
    pub wake: Option<FriendWake>,
    pub profile_refetch_user_ids: Vec<String>,
    pub icon_changes: Vec<FriendIconChange>,
}

impl RealtimeFriendOutput {
    pub(crate) fn new(owner_user_id: OwnerId, generation: u64, baseline_revision: u64) -> Self {
        Self::from_projection(
            owner_user_id,
            FriendProjection::new(generation, baseline_revision),
        )
    }

    pub(crate) fn from_projection(owner_user_id: OwnerId, projection: FriendProjection) -> Self {
        Self {
            owner_user_id,
            projection,
            persistence: RealtimePersistenceBatch::default(),
            joining: Vec::new(),
            wake: None,
            profile_refetch_user_ids: Vec::new(),
            icon_changes: Vec::new(),
        }
    }

    pub(crate) fn from_baseline(
        owner_user_id: OwnerId,
        projection: FriendProjection,
        feed_entries: Vec<FeedLiveEntry>,
        joining: Vec<FeedLiveEntry>,
    ) -> Self {
        let mut output = Self::from_projection(owner_user_id, projection);
        output.persistence.feed_entries = feed_entries;
        output.joining = joining;
        output
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RealtimeNotificationOutput {
    pub owner_user_id: OwnerId,
    pub projection: RealtimeNotificationProjection,
    pub persistence: RealtimePersistenceBatch,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RealtimeCurrentUserOutput {
    pub owner_user_id: OwnerId,
    pub projection: RealtimeCurrentUserProjection,
    pub persistence: RealtimePersistenceBatch,
    pub wake: Option<WakeDeadline>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RealtimeInstanceClosedOutput {
    pub projection: RealtimeInstanceClosedProjection,
    pub feed_entry: FeedLiveEntry,
    pub persistence: RealtimePersistenceBatch,
}
