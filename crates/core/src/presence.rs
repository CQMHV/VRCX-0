use serde::Serialize;

use crate::location::{is_real_instance, parse_location, ParsedLocation};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Place {
    Instance(String),
    Traveling { to: Option<String> },
    Private,
    Unknown,
}

impl Place {
    pub fn from_location(location: &str, traveling_to: &str) -> Self {
        let location = location.trim();
        match location.to_ascii_lowercase().as_str() {
            "traveling" | "traveling:traveling" => {
                let to = traveling_to.trim();
                Self::Traveling {
                    to: is_real_instance(to).then(|| to.to_string()),
                }
            }
            "private" | "private:private" => Self::Private,
            _ if is_real_instance(location) => Self::Instance(location.to_string()),
            _ => Self::Unknown,
        }
    }

    pub fn tag(&self) -> &str {
        match self {
            Self::Instance(tag) => tag,
            Self::Traveling { .. } => "traveling",
            Self::Private => "private",
            Self::Unknown => "",
        }
    }

    pub fn instance_tag(&self) -> Option<&str> {
        match self {
            Self::Instance(tag) => Some(tag),
            _ => None,
        }
    }

    pub fn traveling_to(&self) -> Option<&str> {
        match self {
            Self::Traveling { to } => to.as_deref(),
            _ => None,
        }
    }

    pub fn is_gps_endpoint(&self) -> bool {
        matches!(self, Self::Instance(_) | Self::Private)
    }
}

pub fn is_online_location_proof(value: &str) -> bool {
    !matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "offline" | "offline:offline"
    )
}

pub fn is_offline_location_proof(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "offline" | "offline:offline"
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LeaveTarget {
    Offline,
    Active,
}

#[derive(Clone, Debug, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PresencePlace {
    pub location: ParsedLocation,
    pub traveling_to: Option<ParsedLocation>,
    #[specta(type = f64)]
    pub since_ms: i64,
}

impl PresencePlace {
    pub fn new(place: &Place, since_ms: i64) -> Self {
        Self {
            location: parse_location(place.tag()),
            traveling_to: place.traveling_to().map(parse_location),
            since_ms,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PresenceView {
    Online {
        place: PresencePlace,
        platform: String,
    },
    #[serde(rename_all = "camelCase")]
    PendingOffline {
        place: PresencePlace,
        platform: String,
        target: LeaveTarget,
        #[specta(type = f64)]
        deadline_ms: i64,
    },
    Active {
        platform: String,
    },
    Offline,
}

#[derive(Clone, Debug, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PresenceEntry {
    #[specta(type = f64)]
    pub rev: u64,
    pub view: PresenceView,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn places_classify_sentinels_and_real_instances() {
        assert_eq!(
            Place::from_location(" wrld_a:1~region(jp) ", ""),
            Place::Instance("wrld_a:1~region(jp)".into())
        );
        assert_eq!(Place::from_location("private", ""), Place::Private);
        assert_eq!(
            Place::from_location("traveling", "wrld_b:2"),
            Place::Traveling {
                to: Some("wrld_b:2".into())
            }
        );
        assert_eq!(
            Place::from_location("traveling:traveling", "offline"),
            Place::Traveling { to: None }
        );
        for unknown in ["", "offline", "offline:offline", "local:abc", ":"] {
            assert_eq!(
                Place::from_location(unknown, ""),
                Place::Unknown,
                "{unknown}"
            );
        }
    }

    #[test]
    fn location_proofs_split_online_and_offline() {
        assert!(is_online_location_proof("private"));
        assert!(is_online_location_proof("local:abc"));
        assert!(!is_online_location_proof(" "));
        assert!(!is_online_location_proof("offline:offline"));
        assert!(is_offline_location_proof("OFFLINE"));
        assert!(!is_offline_location_proof(""));
    }

    #[test]
    fn presence_view_serializes_as_tagged_union() {
        let view = PresenceView::PendingOffline {
            place: PresencePlace::new(&Place::Private, 5),
            platform: "standalonewindows".into(),
            target: LeaveTarget::Active,
            deadline_ms: 9,
        };
        let json = serde_json::to_value(view).unwrap();
        assert_eq!(json["kind"], "pendingOffline");
        assert_eq!(json["target"], "active");
        assert_eq!(json["deadlineMs"], 9);
        assert_eq!(json["place"]["sinceMs"], 5);
        assert_eq!(json["place"]["location"]["isPrivate"], true);
        assert_eq!(
            serde_json::to_value(PresenceView::Offline).unwrap()["kind"],
            "offline"
        );
    }
}
