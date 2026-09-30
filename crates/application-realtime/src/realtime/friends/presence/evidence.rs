use serde_json::Value;
use vrcx_0_core::friends::{FriendRecord, StateBucket};
use vrcx_0_core::presence::{is_offline_location_proof, is_online_location_proof, Place};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Source {
    Ws,
    Api,
    TrustedAdd,
    Baseline,
    Timer,
    Reconnect,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Claim {
    Online { place: Place, platform: String },
    Active { platform: String },
    Offline,
    NotInGame,
    Place { place: Place },
    Nothing,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Evidence {
    pub(crate) source: Source,
    pub(crate) claim: Claim,
    pub(crate) refetch_hint: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum WsPresenceEvent {
    Online,
    Active,
    Offline,
    Location,
    Update,
}

impl Evidence {
    pub(crate) fn new(source: Source, claim: Claim) -> Self {
        Self {
            source,
            claim,
            refetch_hint: false,
        }
    }

    pub(crate) fn wake() -> Self {
        Self::new(Source::Timer, Claim::Nothing)
    }

    pub(crate) fn reconnect() -> Self {
        Self::new(Source::Reconnect, Claim::Nothing)
    }

    pub(crate) fn from_ws(event: WsPresenceEvent, content: &Value) -> Self {
        let platform = text(content.get("platform"));
        let claim = match event {
            WsPresenceEvent::Online => Claim::Online {
                place: event_place(content),
                platform,
            },
            WsPresenceEvent::Active => Claim::Active { platform },
            WsPresenceEvent::Offline => Claim::Offline,
            WsPresenceEvent::Location => return location_evidence(content, platform),
            WsPresenceEvent::Update => match content.get("user") {
                Some(user) if user.get("location").is_some() => Claim::Place {
                    place: Place::from_location(
                        &text(user.get("location")),
                        &text(user.get("travelingToLocation")),
                    ),
                },
                _ => Claim::Nothing,
            },
        };
        Self::new(Source::Ws, claim)
    }

    pub(crate) fn from_profile(source: Source, profile: &Value) -> Self {
        let place = Place::from_location(
            &text(profile.get("location")),
            &text(profile.get("travelingToLocation")),
        );
        let platform = text(profile.get("platform"));
        let claim = match StateBucket::normalize(&text(profile.get("state"))) {
            Some(StateBucket::Online) => Claim::Online { place, platform },
            Some(StateBucket::Active) => Claim::Active { platform },
            Some(StateBucket::Offline) => Claim::Offline,
            None => Claim::Nothing,
        };
        Self::new(source, claim)
    }

    pub(crate) fn from_baseline(record: &FriendRecord) -> Self {
        let platform = record.platform.to_string();
        let claim = match StateBucket::normalize(&record.state) {
            Some(StateBucket::Online) => Claim::Online {
                place: Place::from_location(&record.location, &record.traveling_to_location),
                platform,
            },
            Some(StateBucket::Active) => Claim::Active { platform },
            _ => Claim::Offline,
        };
        Self::new(Source::Baseline, claim)
    }
}

fn location_evidence(content: &Value, platform: String) -> Evidence {
    let has_user = content
        .get("user")
        .and_then(|user| user.get("id"))
        .and_then(Value::as_str)
        .is_some_and(|id| !id.trim().is_empty());
    let [location, traveling] = presence_locations(content);
    let candidates = [location.as_str(), traveling.as_str()];
    let online_proof = candidates
        .iter()
        .any(|value| is_online_location_proof(value));
    let offline_proof = candidates
        .iter()
        .any(|value| is_offline_location_proof(value));
    let place = Place::from_location(&location, &traveling);
    let claim = match (has_user, online_proof, offline_proof) {
        (true, true, _) => Claim::Online { place, platform },
        (false, true, _) => Claim::Place { place },
        (_, false, true) => Claim::NotInGame,
        _ => Claim::Nothing,
    };
    Evidence {
        source: Source::Ws,
        claim,
        refetch_hint: has_user && !online_proof,
    }
}

fn event_place(content: &Value) -> Place {
    let [location, traveling] = presence_locations(content);
    Place::from_location(&location, &traveling)
}

fn presence_locations(content: &Value) -> [String; 2] {
    let top = [
        text(content.get("location")),
        text(content.get("travelingToLocation")),
    ];
    if top.iter().any(|value| !value.is_empty()) {
        return top;
    }
    let user = content.get("user");
    [
        text(user.and_then(|user| user.get("location"))),
        text(user.and_then(|user| user.get("travelingToLocation"))),
    ]
}

fn text(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}
