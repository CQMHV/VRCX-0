use serde_json::Value;
use vrcx_0_core::derived_keys;
use vrcx_0_core::friends::FriendRecord;
use vrcx_0_core::presence::PresenceEntry;

use crate::realtime::friends::presence::{presence_view, Evidence, Phase};

const PRESENCE_KEYS: &[&str] = &[
    "state",
    "location",
    "travelingToLocation",
    "worldId",
    "instanceId",
    "travelingToWorld",
    "travelingToInstance",
    "platform",
    "pendingOffline",
    "locationUpdatedAt",
    "travelingToTime",
    derived_keys::LOCATION_PROJECTION,
    derived_keys::TRAVELING_TO_LOCATION_PROJECTION,
    derived_keys::LOCATION_UPDATED_AT,
    derived_keys::LOCATION_TAG,
    derived_keys::PREVIOUS_LOCATION,
    derived_keys::PREVIOUS_LOCATION_UPDATED_AT,
    derived_keys::TRAVELING_TO_TIME,
];

pub(super) fn strip_presence_keys(patch: &mut Value) {
    if let Some(patch) = patch.as_object_mut() {
        for key in PRESENCE_KEYS {
            patch.remove(*key);
        }
    }
}

fn strip_record_presence(record: &mut FriendRecord) {
    record.state = Default::default();
    record.location.clear();
    record.traveling_to_location.clear();
    record.world_id.clear();
    record.platform = Default::default();
    for key in PRESENCE_KEYS {
        record.extra.remove(*key);
    }
}

pub(super) fn split_baseline_record(mut record: FriendRecord) -> (FriendRecord, Evidence) {
    let evidence = Evidence::from_baseline(&record);
    strip_record_presence(&mut record);
    (record, evidence)
}

pub(crate) fn baseline_friend_view(record: &FriendRecord) -> (FriendRecord, PresenceEntry) {
    let (record, evidence) = split_baseline_record(record.clone());
    let view = presence_view(&Phase::initial(&evidence.claim, 0, false));
    (record, PresenceEntry { rev: 0, view })
}
