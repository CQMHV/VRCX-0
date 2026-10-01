#[cfg(test)]
mod tests {
    use super::super::presence_test_support::{friend_view, is_pending_offline, location_tag};
    use super::super::*;

    #[test]
    fn friend_location_bringing_friend_online_emits_online_instead_of_gps() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendBaselineEntry {
                        record: FriendRecord {
                            id: "usr_friend".into(),
                            display_name: "Friend".into(),
                            ..FriendRecord::default()
                        },
                        presence: FriendBaselinePresence {
                            state: "active".into(),
                            location: "wrld_old:123".into(),
                            ..FriendBaselinePresence::default()
                        },
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
                        "location": "wrld_new:456",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend",
                            "state": "online"
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
        assert_eq!(location_tag(view), Some("wrld_new:456"));
        assert_eq!(output.persistence.feed_entries.len(), 1);
        let entry = output.persistence.feed_entries[0].to_json();
        assert_eq!(entry["type"], "Online");
        assert_eq!(entry["location"], "wrld_new:456");
    }

    #[test]
    fn duplicate_friend_location_payload_is_ignored() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendBaselineEntry {
                        record: FriendRecord {
                            id: "usr_friend".into(),
                            display_name: "Friend".into(),
                            ..FriendRecord::default()
                        },
                        presence: FriendBaselinePresence {
                            state: "online".into(),
                            location: "wrld_old:123".into(),
                            ..FriendBaselinePresence::default()
                        },
                    },
                )]
                .into_iter()
                .collect(),
                ..FriendRosterBaseline::default()
            },
            1,
            0,
        );

        let payload = json!({
            "type": "friend-location",
            "content": {
                "userId": "usr_friend",
                "location": "wrld_new:456",
                "user": {
                    "id": "usr_friend",
                    "displayName": "Friend",
                    "state": "online"
                }
            }
        });

        let RealtimeFriendApplyResult::Output(first) =
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: payload.clone(),
                raw: "{}".into(),
                received_at: "2026-05-15T00:00:01Z".into(),
            })
        else {
            panic!("first friend-location should produce an output");
        };
        assert_eq!(first.persistence.feed_entries[0].to_json()["type"], "GPS");

        assert!(matches!(
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: payload,
                raw: "{}".into(),
                received_at: "2026-05-15T00:06:01Z".into(),
            }),
            RealtimeFriendApplyResult::Ignored
        ));
    }

    #[test]
    fn friend_update_status_visibility_changes_emit_private_and_restored_gps() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendBaselineEntry {
                        record: FriendRecord {
                            id: "usr_friend".into(),
                            display_name: "Friend".into(),
                            status: "join me".into(),
                            ..FriendRecord::default()
                        },
                        presence: FriendBaselinePresence {
                            state: "online".into(),
                            location: "wrld_old:123".into(),
                            ..FriendBaselinePresence::default()
                        },
                    },
                )]
                .into_iter()
                .collect(),
                ..FriendRosterBaseline::default()
            },
            1,
            0,
        );

        let RealtimeFriendApplyResult::Output(arrived) =
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: json!({
                    "type": "friend-location",
                    "content": {
                        "userId": "usr_friend",
                        "location": "wrld_current:456",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend",
                            "state": "online"
                        }
                    }
                }),
                raw: "{}".into(),
                received_at: "2026-05-15T00:00:00Z".into(),
            })
        else {
            panic!("arrival should produce an output");
        };
        assert_eq!(
            arrived.persistence.feed_entries[0].to_json()["location"],
            "wrld_current:456"
        );

        let apply_status_update = |status: &str, location: &str, received_at: &str| {
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: json!({
                    "type": "friend-update",
                    "content": {
                        "userId": "usr_friend",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend",
                            "state": "online",
                            "status": status,
                            "location": location
                        }
                    }
                }),
                raw: "{}".into(),
                received_at: received_at.into(),
            })
        };

        let RealtimeFriendApplyResult::Output(private) =
            apply_status_update("ask me", "private", "2026-05-15T00:01:00Z")
        else {
            panic!("private status update should produce an output");
        };
        assert_eq!(private.persistence.feed_entries.len(), 2);
        assert_eq!(private.persistence.feed_entries[0].to_json()["type"], "GPS");
        assert_eq!(
            private.persistence.feed_entries[0].to_json()["location"],
            "private"
        );
        assert_eq!(
            private.persistence.feed_entries[0].to_json()["worldName"],
            ""
        );
        assert_eq!(
            private.persistence.feed_entries[0].to_json()["groupName"],
            ""
        );
        assert_eq!(
            private.persistence.feed_entries[0].to_json()["previousLocation"],
            "wrld_current:456"
        );
        assert_eq!(
            private.persistence.feed_entries[1].to_json()["type"],
            "Status"
        );
        let private_view = &private.projection.patches[0].presence.view;
        assert_eq!(location_tag(private_view), Some("private"));
        assert!(
            private_view
                .place()
                .expect("online place")
                .location
                .is_private
        );

        let RealtimeFriendApplyResult::Output(restored) =
            apply_status_update("active", "wrld_current:456", "2026-05-15T00:02:00Z")
        else {
            panic!("visible status update should produce an output");
        };
        assert_eq!(restored.persistence.feed_entries.len(), 2);
        assert_eq!(
            restored.persistence.feed_entries[0].to_json()["type"],
            "GPS"
        );
        assert_eq!(
            restored.persistence.feed_entries[0].to_json()["location"],
            "wrld_current:456"
        );
        assert_eq!(
            restored.persistence.feed_entries[0].to_json()["previousLocation"],
            "private"
        );
        assert_eq!(
            restored.persistence.feed_entries[1].to_json()["type"],
            "Status"
        );
        assert_eq!(
            restored.projection.patches[0]
                .presence
                .view
                .place()
                .expect("online place")
                .location
                .world_id,
            "wrld_current"
        );
        assert!(!restored.projection.patches[0]
            .record
            .extra
            .contains_key("$location_at"));
        let location_time = restored
            .projection
            .location_time_snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.iter().find(|entry| entry.user_id == "usr_friend"))
            .expect("restored location time");
        assert_eq!(location_time.location, "wrld_current:456");
        assert_eq!(location_time.since_ms, Some(1_778_803_320_000));
    }

    #[test]
    fn friend_location_top_level_offline_overrides_stale_embedded_location() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendBaselineEntry {
                        record: FriendRecord {
                            id: "usr_friend".into(),
                            display_name: "Friend".into(),
                            ..FriendRecord::default()
                        },
                        presence: FriendBaselinePresence {
                            state: "online".into(),
                            location: "wrld_1:123".into(),
                            ..FriendBaselinePresence::default()
                        },
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
                            "stateBucket": "online",
                            "location": "wrld_stale:456"
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
        assert_eq!(location_tag(view), Some("wrld_1:123"));
        assert!(is_pending_offline(view));
        assert!(output.persistence.feed_entries.is_empty());
        assert!(output.wake.is_some());
        assert_eq!(output.profile_refetch_user_ids, vec!["usr_friend"]);

        let friend = friend_view(&runtime, "usr_friend");
        assert_eq!(friend.section().as_str(), "online");
        assert_eq!(location_tag(&friend), Some("wrld_1:123"));
        assert!(is_pending_offline(&friend));
    }

    #[test]
    fn entering_traveling_emits_one_ephemeral_player_joining_entry() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendBaselineEntry {
                        record: FriendRecord {
                            id: "usr_friend".into(),
                            display_name: "Friend".into(),
                            ..FriendRecord::default()
                        },
                        presence: FriendBaselinePresence {
                            state: "online".into(),
                            location: "wrld_old:123".into(),
                            ..FriendBaselinePresence::default()
                        },
                    },
                )]
                .into_iter()
                .collect(),
                ..FriendRosterBaseline::default()
            },
            1,
            0,
        );

        let payload = json!({
            "type": "friend-location",
            "content": {
                "userId": "usr_friend",
                "location": "traveling",
                "travelingToLocation": "wrld_current:456",
                "user": {
                    "id": "usr_friend",
                    "displayName": "Friend",
                    "state": "online"
                }
            }
        });
        let apply = |received_at: &str| {
            runtime.apply_ws_message(&RealtimeWsMessagePayload {
                json: payload.clone(),
                raw: "{}".into(),
                received_at: received_at.into(),
            })
        };

        let RealtimeFriendApplyResult::Output(first) = apply("2026-07-13T10:00:00Z") else {
            panic!("entering traveling should produce an output");
        };
        assert!(first.persistence.feed_entries.is_empty());
        assert_eq!(first.joining.len(), 1);
        assert_eq!(first.joining[0].to_json()["type"], "OnPlayerJoining");
        assert_eq!(
            first.joining[0].to_json()["travelingToLocation"],
            "wrld_current:456"
        );

        assert!(matches!(
            apply("2026-07-13T10:00:01Z"),
            RealtimeFriendApplyResult::Ignored
        ));
    }

    #[test]
    fn persisted_feed_precedes_ephemeral_joining_projection() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendBaselineEntry {
                        record: FriendRecord {
                            id: "usr_friend".into(),
                            display_name: "Friend".into(),
                            ..FriendRecord::default()
                        },
                        presence: FriendBaselinePresence {
                            state: "offline".into(),
                            location: "offline".into(),
                            ..FriendBaselinePresence::default()
                        },
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
                    "type": "friend-online",
                    "content": {
                        "userId": "usr_friend",
                        "location": "traveling",
                        "travelingToLocation": "wrld_target:456",
                        "user": {
                            "id": "usr_friend",
                            "displayName": "Friend"
                        }
                    }
                }),
                raw: "{}".into(),
                received_at: "2026-07-13T10:00:00Z".into(),
            })
        else {
            panic!("friend-online should produce persisted and ephemeral feed entries");
        };

        assert_eq!(output.persistence.feed_entries.len(), 1);
        assert_eq!(
            output.persistence.feed_entries[0].to_json()["type"],
            "Online"
        );
        assert_eq!(output.joining.len(), 1);
        assert_eq!(output.joining[0].to_json()["type"], "OnPlayerJoining");
    }

    #[test]
    fn returning_to_the_origin_instance_restores_the_dwell_start() {
        let runtime = RealtimeFriendsRuntime::default();
        runtime.set_baseline(
            FriendRosterBaseline {
                current_user_id: "usr_self".into(),
                friends_by_id: [(
                    "usr_friend".to_string(),
                    FriendBaselineEntry {
                        record: FriendRecord {
                            id: "usr_friend".into(),
                            ..FriendRecord::default()
                        },
                        presence: FriendBaselinePresence {
                            state: "offline".into(),
                            ..FriendBaselinePresence::default()
                        },
                    },
                )]
                .into_iter()
                .collect(),
                ..FriendRosterBaseline::default()
            },
            1,
            0,
        );
        let location = |location: &str, received_at: &str| {
            let RealtimeFriendApplyResult::Output(output) =
                runtime.apply_ws_message(&RealtimeWsMessagePayload {
                    json: json!({
                        "type": "friend-location",
                        "content": {
                            "userId": "usr_friend",
                            "location": location,
                            "travelingToLocation": "wrld_origin:1",
                            "user": { "id": "usr_friend" }
                        }
                    }),
                    raw: "{}".into(),
                    received_at: received_at.into(),
                })
            else {
                panic!("friend-location should produce an output");
            };
            output
        };

        let arrived = location("wrld_origin:1", "2026-07-13T10:00:00Z");
        let origin_since = arrived.projection.location_time_snapshot.unwrap()[0].since_ms;
        location("traveling", "2026-07-13T10:30:00Z");
        let back = location("wrld_origin:1", "2026-07-13T10:31:00Z");

        let snapshot = back.projection.location_time_snapshot.unwrap();
        assert_eq!(snapshot[0].location, "wrld_origin:1");
        assert_eq!(snapshot[0].since_ms, origin_since);
    }
}
