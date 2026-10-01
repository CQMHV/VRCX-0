import type { SameInstanceLastLocation } from '@/domain/friends/sameInstanceFriends';
import type {
    FriendProfileFields,
    FriendRecord,
    FriendRecordInput
} from '@/domain/friends/types';
import type { parseLocation } from '@/shared/utils/location';

export type TranslationFn = (
    key: string,
    options?: Record<string, unknown>
) => string;

export type FriendLocationRecord = FriendRecordInput &
    Partial<FriendProfileFields> & {
        $groupName?: string | null;
        $location?: FriendLocationRecord | null;
        group?: FriendLocationRecord | null;
        groupName?: string | null;
        instanceId?: string | null;
        instance_id?: string | null;
        isOffline?: boolean | null;
        isPrivate?: boolean | null;
        isTraveling?: boolean | null;
        locationName?: string | null;
        name?: string | null;
        ref?: FriendLocationRecord | null;
        shortCode?: string | null;
        tag?: string | null;
        world?: FriendLocationRecord | null;
        worldId?: string | null;
        worldName?: string | null;
        world_id?: string | null;
    };

export type FriendLocationFriend = FriendRecord | FriendLocationRecord;

export type FriendsLocationsLastLocation = SameInstanceLastLocation;

export type SameInstanceGroup<
    TFriend extends FriendLocationFriend = FriendLocationFriend
> = {
    location: string;
    friends: TFriend[];
};

export type FriendLocationTarget = {
    rawLocation: string;
    parsed: ReturnType<typeof parseLocation>;
    worldId: string;
    groupId: string;
    instanceId: string;
    accessTypeName: string;
    isOffline: boolean;
    isPrivate: boolean;
    isTraveling: boolean;
};
