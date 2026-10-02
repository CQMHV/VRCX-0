use std::collections::BTreeMap;

use serde_json::{Map, Value};
use vrcx_0_contracts::activity::ActivityKind;

use super::types::{
    ActivityCategory, ActivityFavoriteGroupKeys, ActivityFilters, ActivityRule, ActivityScope,
    ActivitySurfaceFilters, ActivityTypeDefinition,
};

#[derive(Clone, Copy)]
pub(super) struct KindDefinition {
    pub(super) kind: ActivityKind,
    pub(super) category: ActivityCategory,
    allowed_scopes: &'static [ActivityScope],
    default_scope: ActivityScope,
    hmd_default_scope: ActivityScope,
    aliases: &'static [&'static str],
}

const BOOLEAN_SCOPES: &[ActivityScope] = &[ActivityScope::Off, ActivityScope::On];
const DIRECT_ACTOR_SCOPES: &[ActivityScope] = &[
    ActivityScope::Off,
    ActivityScope::On,
    ActivityScope::Friends,
    ActivityScope::SelectedFavorites,
    ActivityScope::AllFavorites,
];
const FRIEND_ACTOR_SCOPES: &[ActivityScope] = &[
    ActivityScope::Off,
    ActivityScope::Friends,
    ActivityScope::SelectedFavorites,
    ActivityScope::AllFavorites,
];
const INSTANCE_ACTOR_SCOPES: &[ActivityScope] = &[
    ActivityScope::Off,
    ActivityScope::Friends,
    ActivityScope::SelectedFavorites,
    ActivityScope::AllFavorites,
    ActivityScope::EveryoneInInstance,
];
const GROUP_FAVORITE_SCOPES: &[ActivityScope] = &[
    ActivityScope::Off,
    ActivityScope::AllFavorites,
    ActivityScope::SelectedFavorites,
];

pub(super) fn definition(kind: ActivityKind) -> KindDefinition {
    use ActivityCategory as C;
    use ActivityKind as K;
    use ActivityScope as S;
    let (category, allowed_scopes, default_scope, hmd_default_scope) = match kind {
        K::Invite | K::RequestInvite | K::InviteResponse | K::Boop => (
            C::ActionRequired,
            DIRECT_ACTOR_SCOPES,
            S::Friends,
            S::Friends,
        ),
        K::RequestInviteResponse => (C::ActionRequired, DIRECT_ACTOR_SCOPES, S::Friends, S::Off),
        K::FriendRequest | K::GroupQueueReady | K::InstanceClosed => {
            (C::ActionRequired, BOOLEAN_SCOPES, S::On, S::On)
        }
        K::OnPlayerJoining => (
            C::CurrentInstance,
            INSTANCE_ACTOR_SCOPES,
            S::Friends,
            S::Friends,
        ),
        K::OnPlayerJoined | K::OnPlayerLeft => (
            C::CurrentInstance,
            INSTANCE_ACTOR_SCOPES,
            S::EveryoneInInstance,
            S::Off,
        ),
        K::LobbyAvatarChange => (C::CurrentInstance, INSTANCE_ACTOR_SCOPES, S::Off, S::Off),
        K::Online | K::Offline | K::Gps | K::Status => (
            C::FavoriteMovement,
            FRIEND_ACTOR_SCOPES,
            S::Friends,
            S::Friends,
        ),
        K::Friend => (C::ProfileChange, BOOLEAN_SCOPES, S::On, S::On),
        K::Unfriend => (C::ProfileChange, BOOLEAN_SCOPES, S::On, S::Off),
        K::DisplayName | K::TrustLevel => (
            C::ProfileChange,
            FRIEND_ACTOR_SCOPES,
            S::Friends,
            S::Friends,
        ),
        K::AvatarChange | K::Bio => (C::ProfileChange, FRIEND_ACTOR_SCOPES, S::Off, S::Off),
        K::GroupChange
        | K::GroupAnnouncement
        | K::GroupEventCreated
        | K::GroupEventStarting
        | K::GroupInformative
        | K::GroupJoinRequest
        | K::GroupTransfer => (C::GroupSocial, BOOLEAN_SCOPES, S::On, S::Off),
        K::GroupInvite => (C::GroupSocial, BOOLEAN_SCOPES, S::On, S::On),
        K::GroupInstanceOpened => (C::GroupSocial, GROUP_FAVORITE_SCOPES, S::Off, S::Off),
        K::Event | K::External => (C::SystemSafety, BOOLEAN_SCOPES, S::On, S::Off),
        K::BlockedOnPlayerJoined => (
            C::SystemSafety,
            INSTANCE_ACTOR_SCOPES,
            S::Off,
            S::EveryoneInInstance,
        ),
        K::BlockedOnPlayerLeft | K::MutedOnPlayerJoined | K::MutedOnPlayerLeft => {
            (C::SystemSafety, INSTANCE_ACTOR_SCOPES, S::Off, S::Off)
        }
        K::VideoPlay => (C::Media, BOOLEAN_SCOPES, S::On, S::Off),
    };
    KindDefinition {
        kind,
        category,
        allowed_scopes,
        default_scope,
        hmd_default_scope,
        aliases: match kind {
            K::AvatarChange => &["Avatar"],
            _ => &[],
        },
    }
}

fn definitions() -> impl Iterator<Item = KindDefinition> {
    ActivityKind::ALL.iter().copied().map(definition)
}

pub(super) fn activity_type_definitions() -> Vec<ActivityTypeDefinition> {
    definitions()
        .map(|definition| ActivityTypeDefinition {
            key: definition.kind,
            category: definition.category,
            allowed_scopes: definition.allowed_scopes.to_vec(),
            default_scope: definition.default_scope,
            hmd_default_scope: definition.hmd_default_scope,
            aliases: definition
                .aliases
                .iter()
                .map(|alias| (*alias).to_string())
                .collect(),
        })
        .collect()
}

pub(super) fn default_activity_rules() -> BTreeMap<String, ActivityRule> {
    rules_with_scope(|definition| definition.default_scope)
}

pub(super) fn hmd_activity_rules() -> BTreeMap<String, ActivityRule> {
    rules_with_scope(|definition| definition.hmd_default_scope)
}

pub(super) fn disabled_activity_rules() -> BTreeMap<String, ActivityRule> {
    rules_with_scope(|_| ActivityScope::Off)
}

fn rules_with_scope(
    scope: impl Fn(&KindDefinition) -> ActivityScope,
) -> BTreeMap<String, ActivityRule> {
    definitions()
        .map(|definition| {
            (
                definition.kind.key().to_string(),
                rule_with_scope(scope(&definition)),
            )
        })
        .collect()
}

pub(super) fn default_rule(definition: &KindDefinition) -> ActivityRule {
    rule_with_scope(definition.default_scope)
}

fn rule_with_scope(scope: ActivityScope) -> ActivityRule {
    ActivityRule {
        scope,
        favorite_group_keys: ActivityFavoriteGroupKeys::All,
    }
}

pub(super) fn has_persisted_filter_rules(value: &Value) -> bool {
    ["wrist", "desktop", "vr", "hmd", "webhook", "tts"]
        .iter()
        .any(|surface| {
            value
                .get(*surface)
                .and_then(Value::as_object)
                .is_some_and(|surface| surface.get("types").and_then(Value::as_object).is_some())
        })
}

pub(super) fn normalize_filters(value: Value) -> ActivityFilters {
    ActivityFilters {
        version: 1,
        wrist: normalize_surface(value.get("wrist")),
        desktop: normalize_surface(value.get("desktop")),
        vr: normalize_surface(value.get("vr")),
        hmd: value
            .get("hmd")
            .map(|surface| normalize_surface_with_default(Some(surface), &hmd_activity_rules()))
            .unwrap_or_else(ActivitySurfaceFilters::hmd_default_rules),
        webhook: value
            .get("webhook")
            .map(|surface| {
                normalize_surface_with_default(Some(surface), &disabled_activity_rules())
            })
            .unwrap_or_else(ActivitySurfaceFilters::disabled_rules),
        tts: value
            .get("tts")
            .map(|surface| normalize_surface(Some(surface)))
            .unwrap_or_else(ActivitySurfaceFilters::default_rules),
    }
}

pub(super) fn normalize_surface(value: Option<&Value>) -> ActivitySurfaceFilters {
    normalize_surface_with_default(value, &default_activity_rules())
}

pub(super) fn normalize_surface_with_default(
    value: Option<&Value>,
    default_types: &BTreeMap<String, ActivityRule>,
) -> ActivitySurfaceFilters {
    let surface = value.and_then(Value::as_object);
    let types = surface
        .and_then(|surface| surface.get("types"))
        .and_then(Value::as_object);
    let mut normalized = ActivitySurfaceFilters {
        types: default_types.clone(),
    };
    for definition in definitions() {
        let source = types.and_then(|types| get_type_candidate(types, &definition));
        let fallback_rule = default_types
            .get(definition.kind.key())
            .cloned()
            .unwrap_or_else(|| default_rule(&definition));
        let rule = source
            .map(|source| normalize_rule(source, &definition, &fallback_rule))
            .unwrap_or(fallback_rule);
        normalized
            .types
            .insert(definition.kind.key().to_string(), rule);
    }
    normalized
}

pub(super) fn normalize_id(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_rule(
    source: &Value,
    definition: &KindDefinition,
    fallback: &ActivityRule,
) -> ActivityRule {
    let scope = source
        .get("scope")
        .and_then(Value::as_str)
        .and_then(parse_scope)
        .filter(|scope| definition.allowed_scopes.contains(scope))
        .unwrap_or(fallback.scope);
    let favorite_group_keys = if scope == ActivityScope::SelectedFavorites {
        if source.get("favoriteGroupKeys").is_some() {
            normalize_favorite_group_keys(source.get("favoriteGroupKeys"))
        } else {
            fallback.favorite_group_keys.clone()
        }
    } else {
        ActivityFavoriteGroupKeys::All
    };
    normalize_group_instance_rule(
        definition,
        ActivityRule {
            scope,
            favorite_group_keys,
        },
    )
}

fn parse_scope(value: &str) -> Option<ActivityScope> {
    match value {
        "off" => Some(ActivityScope::Off),
        "on" => Some(ActivityScope::On),
        "friends" => Some(ActivityScope::Friends),
        "selectedFavorites" => Some(ActivityScope::SelectedFavorites),
        "allFavorites" => Some(ActivityScope::AllFavorites),
        "everyoneInInstance" => Some(ActivityScope::EveryoneInInstance),
        _ => None,
    }
}

fn normalize_group_instance_rule(definition: &KindDefinition, rule: ActivityRule) -> ActivityRule {
    if definition.kind == ActivityKind::GroupInstanceOpened
        && rule.scope == ActivityScope::SelectedFavorites
        && matches!(rule.favorite_group_keys, ActivityFavoriteGroupKeys::All)
    {
        ActivityRule {
            scope: ActivityScope::Off,
            favorite_group_keys: ActivityFavoriteGroupKeys::All,
        }
    } else {
        rule
    }
}

fn get_type_candidate<'a>(
    values: &'a Map<String, Value>,
    definition: &KindDefinition,
) -> Option<&'a Value> {
    values.get(definition.kind.key()).or_else(|| {
        definition
            .aliases
            .iter()
            .find_map(|alias| values.get(*alias))
    })
}

fn normalize_favorite_group_keys(value: Option<&Value>) -> ActivityFavoriteGroupKeys {
    let Some(value) = value else {
        return ActivityFavoriteGroupKeys::All;
    };
    if value.as_str() == Some("all") {
        return ActivityFavoriteGroupKeys::All;
    }
    let Some(values) = value.as_array() else {
        return ActivityFavoriteGroupKeys::All;
    };
    let mut keys = values
        .iter()
        .filter_map(Value::as_str)
        .map(normalize_id)
        .filter(|key| !key.is_empty())
        .collect::<Vec<_>>();
    keys.sort();
    keys.dedup();
    if keys.is_empty() {
        ActivityFavoriteGroupKeys::All
    } else {
        ActivityFavoriteGroupKeys::Selected(keys)
    }
}
