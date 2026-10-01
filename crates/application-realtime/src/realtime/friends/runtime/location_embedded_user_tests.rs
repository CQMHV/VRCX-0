#[cfg(test)]
mod tests {
    use super::super::presence_test_support::{friend_view, is_pending_offline, location_tag};
    use super::super::*;

    #[test]
    fn friend_location_embedded_state_does_not_override_real_location() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendRecord {
                        id: "usr_friend".into(),
                        display_name: "Friend".into(),
                        state: "online".into(),
                        location: "wrld_1:123".into(),
                        ..FriendRecord::default()
                    },
                )]
                .into_iter()
                .collect(),
                ..FriendRosterBaseline::default()
            },
            1,
            0,
        );

        let RealtimeFriendApplyResult::Output(output) =
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: json!({
                    "type": "friend-location",
                    "content": {
                        "userId": "usr_friend",
                        "location": "wrld_2:456",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend",
                            "state": "offline"
                        }
                    }
                }),
                raw: "{}".into(),
                received_at: "2026-05-15T00:00:00Z".into(),
            })
        else {
            panic!("friend-location should produce an output");
        };

        let view = &output.projection.patches[0].presence.view;
        assert_eq!(view.section().as_str(), "online");
        assert_eq!(output.persistence.feed_entries[0].to_json()["type"], "GPS");
        assert_eq!(location_tag(view), Some("wrld_2:456"));
        assert!(output.profile_refetch_user_ids.is_empty());
        assert_eq!(
            location_tag(&friend_view(&runtime, "usr_friend")),
            Some("wrld_2:456")
        );
    }

    #[test]
    fn friend_location_offline_offline_alias_is_not_online_proof() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendRecord {
                        id: "usr_friend".into(),
                        display_name: "Friend".into(),
                        state: "online".into(),
                        location: "wrld_1:123".into(),
                        ..FriendRecord::default()
                    },
                )]
                .into_iter()
                .collect(),
                ..FriendRosterBaseline::default()
            },
            1,
            0,
        );

        let RealtimeFriendApplyResult::Output(output) =
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: json!({
                    "type": "friend-location",
                    "content": {
                        "userId": "usr_friend",
                        "location": "offline:offline",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend"
                        }
                    }
                }),
                raw: "{}".into(),
                received_at: "2026-05-15T00:00:00Z".into(),
            })
        else {
            panic!("friend-location should produce an output");
        };

        assert_eq!(
            output.projection.patches[0]
                .presence
                .view
                .section()
                .as_str(),
            "online"
        );
        assert!(output.persistence.feed_entries.is_empty());
        assert_eq!(
            friend_view(&runtime, "usr_friend").section().as_str(),
            "online"
        );
    }

    #[test]
    fn friend_location_embedded_user_without_online_location_preserves_pending_offline() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendRecord {
                        id: "usr_friend".into(),
                        display_name: "Friend".into(),
                        state: "online".into(),
                        location: "wrld_1:123".into(),
                        ..FriendRecord::default()
                    },
                )]
                .into_iter()
                .collect(),
                ..FriendRosterBaseline::default()
            },
            1,
            0,
        );

        let RealtimeFriendApplyResult::Output(_) =
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: json!({
                    "type": "friend-offline",
                    "content": { "userId": "usr_friend" }
                }),
                raw: "{}".into(),
                received_at: "2026-05-15T00:00:00Z".into(),
            })
        else {
            panic!("friend-offline should produce an output");
        };

        let RealtimeFriendApplyResult::Output(output) =
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: json!({
                    "type": "friend-location",
                    "content": {
                        "userId": "usr_friend",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend",
                            "state": "active"
                        }
                    }
                }),
                raw: "{}".into(),
                received_at: "2026-05-15T00:00:01Z".into(),
            })
        else {
            panic!("friend-location should produce an output");
        };

        let view = &output.projection.patches[0].presence.view;
        assert_eq!(view.section().as_str(), "online");
        assert!(output.persistence.feed_entries.is_empty());
        assert!(is_pending_offline(view));
        assert_eq!(output.profile_refetch_user_ids, vec!["usr_friend"]);
        assert!(runtime.wake("usr_friend", "2026-05-15T00:03:00Z").is_some());
    }
}
