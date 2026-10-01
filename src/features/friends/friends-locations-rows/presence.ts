import {
    buildSameInstanceFriendGroups,
    type SameInstanceFriendGroupOptions
} from '@/domain/friends/sameInstanceFriends';
import { parseLocation } from '@/shared/utils/location';

import {
    isRecord,
    normalizeDisplayText,
    normalizeFriendsLocationId,
    resolveDisplayWorldName,
    sourceFromFriend
} from './normalization';
import type {
    FriendLocationFriend,
    FriendsLocationsLastLocation,
    SameInstanceGroup
} from './types';

export function resolveFriendWorldName(
    friend: FriendLocationFriend | null | undefined
) {
    const source = sourceFromFriend(friend);
    return resolveDisplayWorldName(
        source?.worldName,
        source?.$worldName,
        source?.world?.name,
        source?.locationName
    );
}

export function resolveFriendGroupName(
    friend: FriendLocationFriend | null | undefined
) {
    const source = sourceFromFriend(friend);
    return normalizeDisplayText(
        source?.groupName ||
            source?.$groupName ||
            source?.group?.name ||
            source?.group?.displayName
    );
}

export function uniqueFriendsById<TFriend extends FriendLocationFriend>(
    friends: TFriend[] | null
) {
    const seen = new Set<string>();
    const rows: TFriend[] = [];
    for (const friend of friends ?? []) {
        const id = normalizeFriendsLocationId(
            isRecord(friend) ? friend.id || friend.userId : ''
        );
        if (!id) {
            rows.push(friend);
            continue;
        }
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        rows.push(friend);
    }
    return rows;
}

export function isShareableInstanceLocation(location: unknown) {
    const parsed = parseLocation(location);
    return Boolean(
        location &&
        parsed.worldId &&
        parsed.instanceId &&
        !parsed.isOffline &&
        !parsed.isPrivate &&
        !parsed.isTraveling
    );
}

export function buildSameInstanceGroups<TFriend extends FriendLocationFriend>(
    friends: TFriend[] | null,
    lastLocation: FriendsLocationsLastLocation | null = null,
    options: SameInstanceFriendGroupOptions = {}
): SameInstanceGroup<TFriend>[] {
    return buildSameInstanceFriendGroups(
        friends ?? [],
        lastLocation,
        options
    ).map(({ location, friends: groupedFriends }) => ({
        location,
        friends: groupedFriends
    }));
}
