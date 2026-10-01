mod presence;
mod runtime;

pub use runtime::RealtimeFriendsRuntime;
pub(crate) use runtime::{baseline_friend_view, trust_level_feed_entry, SyntheticFriendEvent};
