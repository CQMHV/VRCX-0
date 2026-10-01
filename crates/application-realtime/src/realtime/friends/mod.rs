mod presence;
mod runtime;

pub use runtime::RealtimeFriendsRuntime;
pub(crate) use runtime::{
    baseline_friend_view, player_joining_feed_entry, trust_level_feed_entry, SyntheticFriendEvent,
};
