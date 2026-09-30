use vrcx_0_core::presence::{PresencePlace, PresenceView};

use super::model::Phase;

pub(crate) fn presence_view(phase: &Phase) -> PresenceView {
    match phase {
        Phase::Offline { .. } => PresenceView::Offline,
        Phase::Active { platform, .. } => PresenceView::Active {
            platform: platform.clone(),
        },
        Phase::Online(state) => PresenceView::Online {
            place: PresencePlace::new(&state.place, state.since_ms),
            platform: state.platform.clone(),
        },
        Phase::PendingOffline {
            held,
            target,
            deadline_ms,
        } => PresenceView::PendingOffline {
            place: PresencePlace::new(&held.place, held.since_ms),
            platform: held.platform.clone(),
            target: *target,
            deadline_ms: *deadline_ms,
        },
    }
}
