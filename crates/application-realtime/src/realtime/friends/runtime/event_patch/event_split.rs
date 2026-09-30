use serde_json::{json, Value};

use super::patch_builders::event_user_patch;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum EventSource {
    Websocket,
    ApiProfile,
    TrustedFriendAdd,
}

pub(super) fn profile_patch(content: &Value, user_id: &str) -> Value {
    event_user_patch(content, user_id).unwrap_or_else(|| json!({ "id": user_id }))
}
