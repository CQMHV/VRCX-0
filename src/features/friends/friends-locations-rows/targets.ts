import { presenceOf, presenceTravelingTag } from '@/domain/friends/presence';
import {
    parseLocation,
    resolveFriendPresenceLocation
} from '@/shared/utils/location';

import {
    localized,
    normalizeFriendsLocationId,
    resolveWorldIdCandidate,
    sourceFromFriend
} from './normalization';
import { resolveFriendGroupName, resolveFriendWorldName } from './presence';
import type {
    FriendLocationFriend,
    FriendLocationTarget,
    TranslationFn
} from './types';

export function locationTarget(rawLocation: string): FriendLocationTarget {
    const parsed = parseLocation(rawLocation);
    return {
        rawLocation,
        parsed,
        worldId:
            !rawLocation || parsed.isOffline || parsed.isPrivate
                ? ''
                : resolveWorldIdCandidate(parsed.worldId),
        groupId: parsed.groupId || '',
        instanceId: parsed.instanceId || '',
        accessTypeName: parsed.accessTypeName || '',
        isOffline: !rawLocation || parsed.isOffline,
        isPrivate: parsed.isPrivate,
        isTraveling: parsed.isTraveling
    };
}

export function resolveLocationTarget(
    friend: FriendLocationFriend | null | undefined
): FriendLocationTarget {
    return locationTarget(resolveFriendPresenceLocation(friend));
}

export function isFriendInPrivateLocation(
    friend: FriendLocationFriend | null | undefined
) {
    const target = resolveLocationTarget(friend);
    return target.isPrivate;
}

export function partitionFriendsByPrivateLocation<
    TFriend extends FriendLocationFriend
>(friends: TFriend[]) {
    const visibleLocation: TFriend[] = [];
    const privateLocation: TFriend[] = [];
    for (const friend of friends) {
        if (isFriendInPrivateLocation(friend)) {
            privateLocation.push(friend);
        } else {
            visibleLocation.push(friend);
        }
    }
    return { visibleLocation, privateLocation };
}

export function resolveLocationSummary(
    friend: FriendLocationFriend | null | undefined,
    t: TranslationFn | null = null
) {
    const presence = presenceOf(sourceFromFriend(friend));
    const travelingToLocation = presence ? presenceTravelingTag(presence) : '';
    if (travelingToLocation) {
        return {
            label: resolveFriendWorldName(friend),
            meta:
                parseLocation(travelingToLocation).instanceName ||
                travelingToLocation
        };
    }

    return summarizeLocation(
        resolveFriendPresenceLocation(friend, { preferTraveling: false }),
        friend,
        t
    );
}

export function summarizeLocation(
    location: string,
    friend: FriendLocationFriend | null | undefined,
    t: TranslationFn | null = null
) {
    const parsedLocation = parseLocation(location);

    if (!location || parsedLocation.isOffline) {
        return {
            label: localized(t, 'location.offline', 'Offline'),
            meta: ''
        };
    }

    if (parsedLocation.isPrivate) {
        return {
            label: localized(t, 'location.private', 'Private'),
            meta: ''
        };
    }

    if (parsedLocation.isTraveling) {
        return {
            label: localized(t, 'location.traveling', 'Traveling'),
            meta: resolveFriendWorldName(friend) || location
        };
    }

    return {
        label: resolveFriendWorldName(friend),
        meta: [
            resolveFriendGroupName(friend),
            parsedLocation.accessTypeName,
            parsedLocation.instanceName
        ]
            .filter(Boolean)
            .join(' · ')
    };
}

export function resolveWorldDialogTarget(
    target: Partial<FriendLocationTarget> | null
) {
    const rawLocation = normalizeFriendsLocationId(target?.rawLocation);
    const worldId = normalizeFriendsLocationId(target?.worldId);
    const parsed = target?.parsed || parseLocation(rawLocation);
    if (parsed?.isRealInstance && parsed?.tag) {
        return parsed.tag;
    }
    const parsedWorldId = resolveWorldIdCandidate(parsed.worldId);
    return resolveWorldIdCandidate(worldId, parsedWorldId, rawLocation);
}
