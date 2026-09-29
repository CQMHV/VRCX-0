use std::sync::Mutex;
use std::time::Duration;

use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::time::Instant;

use vrcx_0_application_core::vrchat_api::VrchatApiResponse;
use vrcx_0_application_core::RuntimeOperationStatus;

use super::service::{build_member_request, execute_group_api_raw, GroupApiDeps};
use super::types::VrchatGroupUserInput;

const MEMBER_ROLE_LOOKUP_COMMAND: &str = "app__vrchat_group_member_role_ids_get";
const MEMBER_ROLE_LOOKUP_CONCURRENCY: usize = 3;
const MEMBER_ROLE_LOOKUP_RETRIES: u32 = 3;
const MEMBER_ROLE_LOOKUP_RETRY_DELAY: Duration = Duration::from_secs(1);
const RATE_LIMITED_STATUS: i32 = 429;

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VrchatGroupMemberRoleIdsInput {
    pub group_id: String,
    pub user_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GroupMemberRoleIds {
    pub user_id: String,
    pub role_ids: Option<Vec<String>>,
}

#[derive(Default)]
struct RateLimitPause(Mutex<Option<Instant>>);

impl RateLimitPause {
    async fn wait(&self) {
        let until = *self.0.lock().unwrap();
        if let Some(until) = until {
            tokio::time::sleep_until(until).await;
        }
    }

    fn extend(&self, delay: Duration) {
        let until = Instant::now() + delay;
        let mut current = self.0.lock().unwrap();
        if current.is_none_or(|current| current < until) {
            *current = Some(until);
        }
    }
}

pub async fn get_member_role_ids(
    deps: GroupApiDeps,
    input: VrchatGroupMemberRoleIdsInput,
) -> Vec<GroupMemberRoleIds> {
    deps.diagnostics.record_command(
        MEMBER_ROLE_LOOKUP_COMMAND,
        RuntimeOperationStatus::Running,
        format!(
            "Getting roles of {} members of group {}.",
            input.user_ids.len(),
            input.group_id
        ),
    );
    let deps = &deps;
    let pause = &RateLimitPause::default();
    let group_id = input.group_id.as_str();
    let results: Vec<GroupMemberRoleIds> = stream::iter(input.user_ids)
        .map(|user_id| async move {
            let role_ids = lookup_member_role_ids(deps, pause, group_id, &user_id).await;
            GroupMemberRoleIds { user_id, role_ids }
        })
        .buffer_unordered(MEMBER_ROLE_LOOKUP_CONCURRENCY)
        .collect()
        .await;
    deps.diagnostics.record_command(
        MEMBER_ROLE_LOOKUP_COMMAND,
        RuntimeOperationStatus::Ok,
        format!(
            "Resolved roles for {} of {} members.",
            results
                .iter()
                .filter(|result| result.role_ids.is_some())
                .count(),
            results.len()
        ),
    );
    results
}

async fn lookup_member_role_ids(
    deps: &GroupApiDeps,
    pause: &RateLimitPause,
    group_id: &str,
    user_id: &str,
) -> Option<Vec<String>> {
    let request = build_member_request(
        deps,
        VrchatGroupUserInput {
            group_id: group_id.to_string(),
            user_id: user_id.to_string(),
        },
    )
    .ok()?;
    let mut attempt = 0;
    loop {
        pause.wait().await;
        let response = execute_group_api_raw(deps, request.clone()).await.ok()?;
        if response.status == RATE_LIMITED_STATUS && attempt < MEMBER_ROLE_LOOKUP_RETRIES {
            pause.extend(MEMBER_ROLE_LOOKUP_RETRY_DELAY * 2u32.pow(attempt));
            attempt += 1;
            continue;
        }
        return member_role_ids(&response);
    }
}

fn member_role_ids(response: &VrchatApiResponse) -> Option<Vec<String>> {
    if !(200..300).contains(&response.status) {
        return None;
    }
    let member: Value = serde_json::from_str(&response.data).ok()?;
    member
        .get("userId")
        .and_then(Value::as_str)
        .filter(|user_id| !user_id.is_empty())?;
    Some(
        member
            .get("roleIds")
            .and_then(Value::as_array)
            .map(|role_ids| {
                role_ids
                    .iter()
                    .filter_map(|role_id| role_id.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
    )
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, VecDeque};
    use std::sync::{Arc, Mutex};

    use vrcx_0_application_core::vrchat_api::{VrchatApiRequest, VrchatScope};
    use vrcx_0_application_core::{
        RemoteMutationGate, Result, RuntimeAuthScope, RuntimeDiagnostics, RuntimeSyncEngine,
    };

    use super::*;
    use crate::remote::{VrchatRequestFuture, VrchatRequestPort};
    use crate::social::groups::service::{
        GroupBuiltRequest, GroupRemoteRequest, GroupRemoteRequests,
    };

    struct MemberPathRequests;

    impl GroupRemoteRequests for MemberPathRequests {
        fn build(&self, request: GroupRemoteRequest) -> Result<GroupBuiltRequest> {
            let GroupRemoteRequest::GetMember(input) = request else {
                panic!("unexpected group request");
            };
            Ok(GroupBuiltRequest {
                primary_id: input.group_id.clone(),
                secondary_id: Some(input.user_id.clone()),
                tertiary_id: None,
                request: VrchatApiRequest {
                    method: Some("GET".into()),
                    path: Some(format!(
                        "groups/{}/members/{}",
                        input.group_id, input.user_id
                    )),
                    ..Default::default()
                },
            })
        }
    }

    #[derive(Default)]
    struct ScriptedMemberPort {
        responses: Mutex<HashMap<String, VecDeque<(i32, String)>>>,
        calls: Mutex<Vec<String>>,
    }

    impl ScriptedMemberPort {
        fn script(&self, user_id: &str, responses: &[(i32, &str)]) {
            self.responses.lock().unwrap().insert(
                format!("groups/grp_1/members/{user_id}"),
                responses
                    .iter()
                    .map(|(status, data)| (*status, data.to_string()))
                    .collect(),
            );
        }

        fn calls_for(&self, user_id: &str) -> usize {
            let path = format!("groups/grp_1/members/{user_id}");
            self.calls
                .lock()
                .unwrap()
                .iter()
                .filter(|call| **call == path)
                .count()
        }
    }

    impl VrchatRequestPort for ScriptedMemberPort {
        fn send(&self, input: VrchatApiRequest, _scope: VrchatScope) -> VrchatRequestFuture<'_> {
            let path = input.path.unwrap_or_default();
            self.calls.lock().unwrap().push(path.clone());
            let (status, data) = self
                .responses
                .lock()
                .unwrap()
                .get_mut(&path)
                .and_then(VecDeque::pop_front)
                .unwrap_or((404, "{}".to_string()));
            Box::pin(async move { Ok(VrchatApiResponse { status, data }) })
        }
    }

    fn deps(port: Arc<ScriptedMemberPort>) -> GroupApiDeps {
        GroupApiDeps::new(
            port,
            Arc::new(MemberPathRequests),
            RuntimeDiagnostics::new(),
            RuntimeSyncEngine::new(),
            RuntimeAuthScope::new(),
            Arc::new(RemoteMutationGate::default()),
        )
    }

    fn lookup(user_ids: &[&str]) -> VrchatGroupMemberRoleIdsInput {
        VrchatGroupMemberRoleIdsInput {
            group_id: "grp_1".into(),
            user_ids: user_ids.iter().map(|id| id.to_string()).collect(),
        }
    }

    #[tokio::test]
    async fn reads_role_ids_and_marks_lookups_that_are_not_members() {
        let port = Arc::new(ScriptedMemberPort::default());
        port.script(
            "usr_member",
            &[(
                200,
                r#"{"userId":"usr_member","roleIds":["grol_mod",7,"grol_vip"]}"#,
            )],
        );
        port.script("usr_outsider", &[(404, r#"{"error":"not a member"}"#)]);
        port.script("usr_blank", &[(200, r#"{"roleIds":["grol_mod"]}"#)]);
        port.script("usr_plain", &[(200, r#"{"userId":"usr_plain"}"#)]);

        let mut result = get_member_role_ids(
            deps(port),
            lookup(&["usr_member", "usr_outsider", "usr_blank", "usr_plain"]),
        )
        .await;
        result.sort_by(|left, right| left.user_id.cmp(&right.user_id));

        assert_eq!(
            result,
            vec![
                GroupMemberRoleIds {
                    user_id: "usr_blank".into(),
                    role_ids: None,
                },
                GroupMemberRoleIds {
                    user_id: "usr_member".into(),
                    role_ids: Some(vec!["grol_mod".into(), "grol_vip".into()]),
                },
                GroupMemberRoleIds {
                    user_id: "usr_outsider".into(),
                    role_ids: None,
                },
                GroupMemberRoleIds {
                    user_id: "usr_plain".into(),
                    role_ids: Some(Vec::new()),
                },
            ]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn retries_rate_limited_lookups_three_times() {
        let port = Arc::new(ScriptedMemberPort::default());
        port.script(
            "usr_recovers",
            &[
                (429, "{}"),
                (429, "{}"),
                (200, r#"{"userId":"usr_recovers","roleIds":["grol_mod"]}"#),
            ],
        );
        port.script(
            "usr_throttled",
            &[
                (429, "{}"),
                (429, "{}"),
                (429, "{}"),
                (429, "{}"),
                (429, "{}"),
            ],
        );

        let mut result = get_member_role_ids(
            deps(port.clone()),
            lookup(&["usr_recovers", "usr_throttled"]),
        )
        .await;
        result.sort_by(|left, right| left.user_id.cmp(&right.user_id));

        assert_eq!(result[0].role_ids, Some(vec!["grol_mod".into()]));
        assert_eq!(result[1].role_ids, None);
        assert_eq!(port.calls_for("usr_recovers"), 3);
        assert_eq!(port.calls_for("usr_throttled"), 4);
    }
}
