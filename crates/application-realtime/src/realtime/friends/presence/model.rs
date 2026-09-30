use vrcx_0_core::presence::{LeaveTarget, Place};

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Phase {
    Offline {
        changed_ms: Option<i64>,
    },
    Active {
        changed_ms: Option<i64>,
        platform: String,
    },
    Online(OnlineState),
    PendingOffline {
        held: OnlineState,
        target: LeaveTarget,
        deadline_ms: i64,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct OnlineState {
    pub(crate) place: Place,
    pub(crate) since_ms: i64,
    pub(crate) travel_from: Option<Stay>,
    pub(crate) platform: String,
    pub(crate) live_ms: Option<i64>,
    pub(crate) hops: Vec<Hop>,
    pub(crate) flap: Option<Flap>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Stay {
    pub(crate) tag: String,
    pub(crate) since_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Hop {
    pub(crate) from: String,
    pub(crate) to: String,
    pub(crate) at_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Flap {
    pub(crate) pair: [String; 2],
    pub(crate) latest: String,
    pub(crate) latest_since_ms: i64,
    pub(crate) last_hop_ms: i64,
}

impl Phase {
    pub(crate) fn offline() -> Self {
        Self::Offline { changed_ms: None }
    }

    pub(crate) fn is_online_section(&self) -> bool {
        matches!(self, Self::Online(_) | Self::PendingOffline { .. })
    }

    pub(crate) fn online_state(&self) -> Option<&OnlineState> {
        match self {
            Self::Online(state) | Self::PendingOffline { held: state, .. } => Some(state),
            _ => None,
        }
    }

    pub(crate) fn left(target: LeaveTarget, platform: String, now_ms: i64) -> Self {
        match target {
            LeaveTarget::Offline => Self::Offline {
                changed_ms: Some(now_ms),
            },
            LeaveTarget::Active => Self::Active {
                changed_ms: Some(now_ms),
                platform,
            },
        }
    }
}

impl OnlineState {
    pub(crate) fn arrive(place: Place, platform: String, now_ms: i64, live: bool) -> Self {
        Self {
            place,
            since_ms: now_ms,
            travel_from: None,
            platform,
            live_ms: live.then_some(now_ms),
            hops: Vec::new(),
            flap: None,
        }
    }
}
