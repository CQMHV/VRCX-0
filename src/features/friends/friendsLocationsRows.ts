export {
    isRawWorldReference,
    isSentinelLocationValue,
    normalizeDisplayText,
    normalizeFriendsLocationId,
    resolveDisplayWorldName,
    resolveWorldIdCandidate
} from './friends-locations-rows/normalization';
export {
    buildSameInstanceGroups,
    isShareableInstanceLocation,
    resolveFriendGroupName,
    resolveFriendWorldName,
    uniqueFriendsById
} from './friends-locations-rows/presence';
export {
    isFriendInPrivateLocation,
    locationTarget,
    partitionFriendsByPrivateLocation,
    resolveLocationSummary,
    resolveLocationTarget,
    resolveWorldDialogTarget,
    summarizeLocation
} from './friends-locations-rows/targets';
export type {
    FriendLocationFriend,
    FriendLocationTarget,
    SameInstanceGroup
} from './friends-locations-rows/types';
export { resolveCurrentInviteLocation as resolveFriendsLocationsCurrentInviteLocation } from '@/shared/utils/invite';
