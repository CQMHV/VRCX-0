use serde_json::{Map, Value};
use vrcx_0_contracts::realtime::{
    RealtimePersistenceBatch, SelfProfileField, SelfProfileObservation,
};

use super::state::RealtimeCurrentUserStateSnapshot;
use crate::realtime::event_time::EventTime;

pub(super) fn append_self_profile_observations(
    observed_fields: &mut Vec<SelfProfileField>,
    previous: &RealtimeCurrentUserStateSnapshot,
    next: &RealtimeCurrentUserStateSnapshot,
    patch: &Map<String, Value>,
    now: &EventTime,
    persistence: &mut RealtimePersistenceBatch,
) {
    for (field, previous_value, value) in [
        (
            SelfProfileField::Status,
            previous.status.as_str(),
            next.status.as_str(),
        ),
        (
            SelfProfileField::StatusDescription,
            previous.status_description.as_str(),
            next.status_description.as_str(),
        ),
        (
            SelfProfileField::Bio,
            previous.bio.as_str(),
            next.bio.as_str(),
        ),
    ] {
        if !patch.get(field.as_str()).is_some_and(Value::is_string) {
            continue;
        }
        if observed_fields.contains(&field) {
            if value == previous_value {
                continue;
            }
        } else {
            observed_fields.push(field);
        }
        persistence
            .self_profile_observations
            .push(SelfProfileObservation {
                observed_at: now.iso.clone(),
                field,
                value: value.to_string(),
            });
    }
}
