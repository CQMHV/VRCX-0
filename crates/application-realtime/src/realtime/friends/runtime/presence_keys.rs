use serde_json::Value;
use vrcx_0_core::derived_keys;
use vrcx_0_core::friends::FriendRecord;

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

pub(super) fn strip_record_presence(record: &mut FriendRecord) {
    record.state = Default::default();
    record.location.clear();
    record.traveling_to_location.clear();
    record.world_id.clear();
    record.platform = Default::default();
    for key in PRESENCE_KEYS {
        record.extra.remove(*key);
    }
}
