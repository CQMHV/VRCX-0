use vrcx_0_core::json::JsonExt;
use vrcx_0_core::presence::{Place, PresencePlace, PresenceView};

use crate::realtime::RealtimeCurrentUserAuthority;

use super::state::RealtimeCurrentUserState;
use super::utils::has_remote_current_user_presence;

pub(super) fn current_user_presence(
    state: &RealtimeCurrentUserState,
    authority: &RealtimeCurrentUserAuthority,
) -> PresenceView {
    let platform = state.snapshot.raw.text_field("last_platform");
    let online = |place: Place| PresenceView::Online {
        place: PresencePlace::new(&place),
        platform: platform.clone(),
        online_since_ms: None,
    };
    if authority.is_game_running() {
        return online(authority.game_log().map_or(Place::Unknown, |game_log| {
            Place::from_location(&game_log.location, &game_log.destination)
        }));
    }
    let remote = &state.remote_snapshot;
    if state.pending_offline.is_some() || has_remote_current_user_presence(remote) {
        return online(Place::from_location(
            &remote.location,
            &remote.traveling_to_location,
        ));
    }
    PresenceView::Active { platform }
}
