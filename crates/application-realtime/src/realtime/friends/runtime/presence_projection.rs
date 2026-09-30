use serde_json::{Map, Value};
use vrcx_0_core::derived_keys;
use vrcx_0_core::friends::FriendRecord;
use vrcx_0_core::location::parse_location;

use crate::realtime::friends::presence::Phase;

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

pub(super) fn project_presence(record: &mut FriendRecord, phase: &Phase) {
    let (state, platform, location, traveling) = match phase {
        Phase::Online(online) | Phase::PendingOffline { held: online, .. } => {
            record
                .extra
                .insert("locationUpdatedAt".into(), Value::from(online.since_ms));
            (
                "online",
                online.platform.as_str(),
                online.place.tag(),
                online.place.traveling_to().unwrap_or(""),
            )
        }
        Phase::Active { platform, .. } => ("active", platform.as_str(), "offline", "offline"),
        Phase::Offline { .. } => ("offline", "", "offline", "offline"),
    };
    record.state = state.into();
    record.platform = platform.into();
    let location_world = project_location(
        &mut record.extra,
        "instanceId",
        derived_keys::LOCATION_PROJECTION,
        location,
    );
    let traveling_world = project_location(
        &mut record.extra,
        "travelingToInstance",
        derived_keys::TRAVELING_TO_LOCATION_PROJECTION,
        traveling,
    );
    record.world_id = if traveling.is_empty() || location != "traveling" {
        location_world
    } else {
        traveling_world.clone()
    };
    record
        .extra
        .insert("travelingToWorld".into(), Value::String(traveling_world));
    record.location = location.to_string();
    record.traveling_to_location = traveling.to_string();
    record.extra.insert(
        "pendingOffline".into(),
        Value::Bool(matches!(phase, Phase::PendingOffline { .. })),
    );
}

fn project_location(
    extra: &mut Map<String, Value>,
    instance_key: &str,
    projection_key: &str,
    location: &str,
) -> String {
    let parsed = parse_location(location);
    extra.insert(
        instance_key.into(),
        Value::String(parsed.instance_id.clone()),
    );
    extra.insert(projection_key.into(), parsed.to_frontend_value(location));
    if parsed.is_offline {
        "offline".to_string()
    } else {
        parsed.world_id
    }
}
