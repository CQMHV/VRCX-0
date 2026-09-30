use vrcx_0_application_core::FriendPlace;
use vrcx_0_core::friends::FriendRecord;
use vrcx_0_core::presence::{Place, PresenceEntry, PresencePlace, PresenceView};

use super::evidence::Evidence;
use super::model::Phase;

pub(crate) fn baseline_presence_entry(record: &FriendRecord, now_ms: i64) -> PresenceEntry {
    PresenceEntry {
        rev: 0,
        view: presence_view(&Phase::initial(
            &Evidence::from_baseline(record).claim,
            now_ms,
            false,
        )),
    }
}

pub(crate) fn dwell_place(phase: &Phase) -> FriendPlace {
    let Some(state) = phase.online_state() else {
        return FriendPlace::Elsewhere {
            location: "offline".to_string(),
        };
    };
    match &state.place {
        Place::Instance(tag) => FriendPlace::Present {
            location: tag.clone(),
            since_ms: state.since_ms,
        },
        Place::Traveling { to } => FriendPlace::Traveling {
            destination: to.clone().unwrap_or_default(),
            since_ms: state.since_ms,
        },
        place => FriendPlace::Elsewhere {
            location: place.tag().to_string(),
        },
    }
}

pub(crate) fn presence_view(phase: &Phase) -> PresenceView {
    match phase {
        Phase::Offline { .. } => PresenceView::Offline,
        Phase::Active { platform, .. } => PresenceView::Active {
            platform: platform.clone(),
        },
        Phase::Online(state) => PresenceView::Online {
            place: PresencePlace::new(&state.place),
            platform: state.platform.clone(),
        },
        Phase::PendingOffline {
            held,
            target,
            deadline_ms,
        } => PresenceView::PendingOffline {
            place: PresencePlace::new(&held.place),
            platform: held.platform.clone(),
            target: *target,
            deadline_ms: *deadline_ms,
        },
    }
}
