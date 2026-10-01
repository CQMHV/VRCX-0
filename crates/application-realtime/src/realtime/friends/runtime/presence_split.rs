use serde_json::Value;
use vrcx_0_core::friends::{FriendBaselineEntry, FriendRecord, FRIEND_PRESENCE_KEYS};
use vrcx_0_core::presence::PresenceEntry;

use crate::realtime::friends::presence::{presence_view, Evidence, Phase};

pub(super) fn strip_presence_keys(patch: &mut Value) {
    if let Some(patch) = patch.as_object_mut() {
        for key in FRIEND_PRESENCE_KEYS {
            patch.remove(*key);
        }
    }
}

pub(crate) fn baseline_friend_view(entry: &FriendBaselineEntry) -> (FriendRecord, PresenceEntry) {
    let evidence = Evidence::from_baseline(&entry.presence);
    let view = presence_view(&Phase::initial(&evidence.claim, 0, false));
    (entry.record.clone(), PresenceEntry { rev: 0, view })
}
