#[cfg(test)]
mod tests {
    use super::super::presence_test_support::{friend_view, is_pending_offline, location_tag};
    use super::super::*;

    #[test]
    fn friend_location_offline_with_real_location_requests_profile_refetch() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendRecord {
                        id: "usr_friend".into(),
                        display_name: "Friend".into(),
                        state: "offline".into(),
                        location: "offline".into(),
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
                        "location": "wrld_2:456"
                    }
                }),
                raw: "{}".into(),
                received_at: "2026-05-15T00:00:00Z".into(),
            })
        else {
            panic!("friend-location should produce an output");
        };

        let view = &output.projection.patches[0].presence.view;
        assert_eq!(view.section().as_str(), "offline");
        assert_eq!(location_tag(view), None);
        assert_eq!(output.profile_refetch_user_ids, vec!["usr_friend"]);
    }

    #[test]
    fn friend_location_embedded_user_without_online_location_does_not_revive_offline_friend() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendRecord {
                        id: "usr_friend".into(),
                        display_name: "Friend".into(),
                        state: "offline".into(),
                        location: "offline".into(),
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
                        "location": "offline",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend",
                            "state": "online",
                            "status": "join me"
                        }
                    }
                }),
                raw: "{}".into(),
                received_at: "2026-05-15T00:03:01Z".into(),
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
            "offline"
        );
        assert_eq!(output.profile_refetch_user_ids, vec!["usr_friend"]);
        assert_eq!(
            friend_view(&runtime, "usr_friend").section().as_str(),
            "offline"
        );
    }

    #[test]
    fn friend_location_embedded_user_offline_location_starts_pending_offline() {
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
                        "location": "offline",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend",
                            "state": "active",
                            "location": "offline"
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
        assert!(
            output.wake.is_some(),
            "offline location should schedule pending timer"
        );
        assert_eq!(view.section().as_str(), "online");
        assert!(output.persistence.feed_entries.is_empty());
        assert_eq!(location_tag(view), Some("wrld_1:123"));
        assert!(is_pending_offline(view));
        let fired = runtime.wake("usr_friend", "2026-05-15T00:03:00Z").unwrap();
        assert_eq!(
            fired.projection.patches[0].presence.view.section().as_str(),
            "offline"
        );
    }
}
