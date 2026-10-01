pub mod service;
pub mod types;

pub use service::{
    build_favorites_baseline, build_favorites_baseline_from_friend_ids,
    build_favorites_baseline_from_friend_records, build_synced_friend_roster_baseline,
    FriendStatusVerdicts, SocialBaselineDeps, SyncedFriendRosterBaseline,
};
pub use types::{
    FavoriteBaselineSnapshot, FavoriteGroupOutput, SocialFavoritesBaselineInput,
    SocialFavoritesBaselineOutput, SocialFavoritesBaselineRequest, SocialFriendRosterBaselineInput,
    SocialFriendRosterBaselineOutput,
};
