import { replaceEqualDeep } from '@tanstack/react-query';
import { create } from 'zustand';

import {
    FRIEND_PROFILE_BOOLEAN_FIELDS,
    FRIEND_PROFILE_STRING_FIELDS,
    type FriendLocationProjection,
    type FriendPatchEntry,
    type FriendPresenceById,
    type FriendProfileFields,
    type FriendRecord,
    type FriendRecordInput,
    type FriendRosterBucket,
    type FriendRosterById,
    type FriendRosterInputById,
    type FriendRosterOrdering,
    type FriendRosterSeedSnapshot,
    type FriendRosterSnapshotInput,
    type FriendRosterState,
    type FriendRosterStore,
    type FriendStateBucketAuthority
} from '@/domain/friends/types';
import { normalizeStateBucket } from '@/domain/users/userFacts';
import { isRecord } from '@/shared/utils/record';
import {
    computeTrustLevel,
    computeUserPlatform
} from '@/shared/utils/userTransforms';

function normalizeUserId(value: unknown): string {
    return typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim();
}

function normalizeOptionalString(value: unknown): string | null | undefined {
    if (typeof value === 'string') {
        return value;
    }
    return value === null ? null : undefined;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function normalizeOptionalTimestamp(
    value: unknown
): number | string | null | undefined {
    if (typeof value === 'number' || typeof value === 'string') {
        return value;
    }
    return value === null ? null : undefined;
}

function normalizeOptionalStringArray(
    value: unknown,
    previous?: string[]
): string[] | undefined {
    if (value === previous) {
        return previous;
    }
    return Array.isArray(value) ? value.map(String) : undefined;
}

function normalizeOptionalArray(
    value: unknown,
    previous?: unknown[]
): unknown[] | undefined {
    if (value === previous) {
        return previous;
    }
    return Array.isArray(value) ? [...value] : undefined;
}

function normalizeOptionalLocationProjection(
    value: unknown,
    previous?: FriendLocationProjection | null
): FriendLocationProjection | null | undefined {
    if (value === previous) {
        return previous;
    }
    if (value === null) {
        return null;
    }
    return isRecord(value) ? { ...value } : undefined;
}

function normalizeFriendProfileFields(
    source: FriendRecordInput,
    previous?: FriendRecord | null
): FriendProfileFields {
    const profile: FriendProfileFields = {};

    for (const field of FRIEND_PROFILE_STRING_FIELDS) {
        const value = normalizeOptionalString(source[field]);
        if (value !== undefined) {
            profile[field] = value;
        }
    }
    for (const field of FRIEND_PROFILE_BOOLEAN_FIELDS) {
        const value = normalizeOptionalBoolean(source[field]);
        if (value !== undefined) {
            profile[field] = value;
        }
    }

    const location = normalizeOptionalLocationProjection(
        source.$location,
        previous?.$location
    );
    if (location !== undefined) {
        profile.$location = location;
    }
    const locationAt = normalizeOptionalTimestamp(source.$location_at);
    if (locationAt !== undefined) {
        profile.$location_at = locationAt;
    }
    const previousLocationAt = normalizeOptionalTimestamp(
        source.$previousLocation_at
    );
    if (previousLocationAt !== undefined) {
        profile.$previousLocation_at = previousLocationAt;
    }
    const travelingToLocation = normalizeOptionalLocationProjection(
        source.$travelingToLocation,
        previous?.$travelingToLocation
    );
    if (travelingToLocation !== undefined) {
        profile.$travelingToLocation = travelingToLocation;
    }
    const badges = normalizeOptionalArray(source.badges, previous?.badges);
    if (badges !== undefined) {
        profile.badges = badges;
    }

    return profile;
}

function normalizeFriendRecordMap(
    value: FriendRosterInputById | null | undefined
): FriendRosterInputById {
    const friendsById: FriendRosterInputById = {};
    if (!isRecord(value)) {
        return friendsById;
    }
    for (const [userId, friend] of Object.entries(value)) {
        if (isRecord(friend)) {
            friendsById[userId] = { ...friend };
        }
    }
    return friendsById;
}

function resolveFriendStateBucket({
    patch,
    stateBucketAuthority,
    existingEntry
}: {
    patch?: FriendRecordInput | null;
    stateBucketAuthority?: FriendStateBucketAuthority;
    existingEntry?: FriendRecord | null;
}): FriendRosterBucket {
    if (stateBucketAuthority === 'preserve') {
        return normalizeStateBucket(existingEntry?.state) || 'offline';
    }

    return (
        normalizeStateBucket(patch?.state) ||
        normalizeStateBucket(existingEntry?.state) ||
        'offline'
    );
}

function getDisplayName(user: FriendRecordInput | null | undefined): string {
    return (
        normalizeUserId(user?.displayName) ||
        normalizeUserId(user?.username) ||
        normalizeUserId(user?.id)
    );
}

function createFallbackFriendUser(
    userId: string,
    existingRow?: FriendRecord | null
): FriendRecordInput {
    return {
        id: userId,
        displayName: existingRow?.displayName || userId,
        username: '',
        tags: [],
        developerType: '',
        platform: 'offline',
        last_platform: '',
        location: 'offline',
        state: 'offline'
    };
}

function normalizePlatformAliases(
    friend: FriendRecordInput
): FriendRecordInput {
    if (!Object.hasOwn(friend, 'lastPlatform')) {
        return friend;
    }
    const normalizedFriend = { ...friend };
    const lastPlatform = normalizeUserId(normalizedFriend.lastPlatform);
    if (lastPlatform) {
        normalizedFriend.last_platform = lastPlatform;
    }
    delete normalizedFriend.lastPlatform;
    return normalizedFriend;
}

function normalizeFriendEntry(
    friend: FriendRecordInput | null | undefined,
    stateBucket: FriendRosterBucket,
    existingRow?: FriendRecord | null
): FriendRecord {
    const fallbackUserId = normalizeUserId(
        existingRow?.id || existingRow?.userId
    );
    const source = normalizePlatformAliases(
        friend ?? createFallbackFriendUser(fallbackUserId, existingRow)
    );
    const tags =
        normalizeOptionalStringArray(source.tags, existingRow?.tags) ?? [];
    const trust = computeTrustLevel(tags, String(source.developerType || ''));
    const explicitTrustLevel = String(
        source.$trustLevel || source.trustLevel || ''
    );
    const hasTrustMetadata =
        Boolean(friend) &&
        (tags.length > 0 ||
            Boolean(source.developerType) ||
            Boolean(explicitTrustLevel));
    const trustLevel =
        explicitTrustLevel ||
        (hasTrustMetadata
            ? trust.trustLevel
            : String(
                  existingRow?.trustLevel || existingRow?.$trustLevel || ''
              )) ||
        trust.trustLevel;
    const friendNumberSource =
        source?.friendNumber ??
        source?.$friendNumber ??
        existingRow?.friendNumber ??
        existingRow?.$friendNumber ??
        0;
    const friendNumber = Number.parseInt(String(friendNumberSource), 10) || 0;
    const displayName =
        getDisplayName(source) ||
        normalizeUserId(existingRow?.displayName) ||
        normalizeUserId(source.id);

    return replaceEqualDeep(existingRow, {
        ...source,
        ...normalizeFriendProfileFields(source, existingRow),
        id: normalizeUserId(source.id),
        displayName,
        tags,
        state: stateBucket,
        friendNumber,
        trustLevel,
        $friendNumber: friendNumber,
        $trustLevel: trustLevel,
        $trustClass: trust.trustClass,
        $trustSortNum: trust.trustSortNum,
        $isModerator: trust.isModerator,
        $isTroll: trust.isTroll,
        $isProbableTroll: trust.isProbableTroll,
        $platform: computeUserPlatform(
            typeof source.platform === 'string' ? source.platform : '',
            typeof source.last_platform === 'string' ? source.last_platform : ''
        )
    });
}

function compareFriendEntries(
    left: FriendRecord | null | undefined,
    right: FriendRecord | null | undefined
): number {
    const leftNumber =
        Number.parseInt(
            String(left?.friendNumber ?? left?.$friendNumber ?? 0),
            10
        ) || 0;
    const rightNumber =
        Number.parseInt(
            String(right?.friendNumber ?? right?.$friendNumber ?? 0),
            10
        ) || 0;
    const leftHasNumber = leftNumber > 0;
    const rightHasNumber = rightNumber > 0;

    if (leftHasNumber !== rightHasNumber) {
        return leftHasNumber ? -1 : 1;
    }

    if (leftHasNumber && rightHasNumber && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
    }

    const leftName = String(left?.displayName || left?.id || '').toLowerCase();
    const rightName = String(
        right?.displayName || right?.id || ''
    ).toLowerCase();
    const nameComparison = leftName.localeCompare(rightName);
    if (nameComparison !== 0) {
        return nameComparison;
    }

    return String(left?.id || '').localeCompare(String(right?.id || ''));
}

function buildBucketIds(
    friendIds: string[],
    friendsById: FriendRosterById,
    stateBucket: FriendRosterBucket
): string[] {
    return friendIds
        .filter((friendId) => friendsById[friendId]?.state === stateBucket)
        .sort((leftId, rightId) =>
            compareFriendEntries(friendsById[leftId], friendsById[rightId])
        );
}

function buildRosterOrdering(
    friendsById: FriendRosterById
): FriendRosterOrdering {
    const friendIds = Object.keys(friendsById);
    const onlineIds = buildBucketIds(friendIds, friendsById, 'online');
    const activeIds = buildBucketIds(friendIds, friendsById, 'active');
    const offlineIds = buildBucketIds(friendIds, friendsById, 'offline');

    return {
        onlineIds,
        activeIds,
        offlineIds,
        orderedFriendIds: [...onlineIds, ...activeIds, ...offlineIds]
    };
}

function normalizeRosterSnapshotFriends(
    friendsById: FriendRosterInputById | null | undefined
): FriendRosterById {
    const normalizedFriendsById: FriendRosterById = {};
    for (const [rawUserId, friend] of Object.entries(
        normalizeFriendRecordMap(friendsById)
    )) {
        const normalizedUserId =
            normalizeUserId(friend?.id || friend?.userId) ||
            normalizeUserId(rawUserId);
        if (!normalizedUserId) {
            continue;
        }
        const stateBucket = resolveFriendStateBucket({
            patch: friend
        });
        normalizedFriendsById[normalizedUserId] = normalizeFriendEntry(
            {
                ...friend,
                id: normalizedUserId
            },
            stateBucket
        );
    }
    return normalizedFriendsById;
}

function friendEntryNeedsOrderingUpdate(
    existingEntry: FriendRecord | null | undefined,
    nextEntry: FriendRecord
): boolean {
    if (!existingEntry) {
        return true;
    }
    const existingBucket =
        normalizeStateBucket(existingEntry?.state) || 'offline';
    const nextBucket = normalizeStateBucket(nextEntry?.state) || 'offline';

    if (existingBucket !== nextBucket) {
        return true;
    }

    return compareFriendEntries(existingEntry, nextEntry) !== 0;
}

const initialState: FriendRosterState = {
    currentUserId: null,
    loadStatus: 'idle',
    detail: '',
    lastLoadedAt: null,
    friendsById: {},
    presenceById: {},
    presenceGeneration: null,
    orderedFriendIds: [],
    onlineIds: [],
    activeIds: [],
    offlineIds: []
};

function isStalePresence(
    presenceById: FriendPresenceById,
    presenceGeneration: number | null,
    userId: string,
    entry: FriendPatchEntry
): boolean {
    if (!entry.presence || entry.generation === undefined) {
        return false;
    }
    if (presenceGeneration === null) {
        return false;
    }
    if (entry.generation !== presenceGeneration) {
        return entry.generation < presenceGeneration;
    }
    const existing = presenceById[userId];
    return existing !== undefined && existing.rev > entry.presence.rev;
}

export const useFriendRosterStore = create<FriendRosterStore>((set) => ({
    ...initialState,
    setRosterLoading(currentUserId: string, detail = '') {
        set((state) => {
            const normalizedCurrentUserId =
                normalizeUserId(currentUserId) || null;
            const isSameUser =
                normalizeUserId(state.currentUserId) ===
                normalizedCurrentUserId;
            const hasRoster =
                Object.keys(state.friendsById || {}).length > 0 ||
                state.orderedFriendIds.length > 0;

            if (isSameUser && hasRoster) {
                return {
                    ...state,
                    currentUserId: normalizedCurrentUserId,
                    loadStatus: 'running',
                    detail
                };
            }

            return {
                currentUserId: normalizedCurrentUserId,
                loadStatus: 'running',
                detail,
                lastLoadedAt: null,
                friendsById: {},
                presenceById: {},
                presenceGeneration: null,
                orderedFriendIds: [],
                onlineIds: [],
                activeIds: [],
                offlineIds: []
            };
        });
    },
    setRosterReady(detail = '') {
        set((state) => ({
            ...state,
            loadStatus: 'ready',
            detail,
            lastLoadedAt: new Date().toISOString()
        }));
    },
    setRosterSnapshot({
        currentUserId,
        friendsById,
        presenceById,
        generation,
        orderedFriendIds,
        onlineIds,
        activeIds,
        offlineIds,
        detail = ''
    }: FriendRosterSnapshotInput) {
        set((state) => {
            const sourceFriendsById = normalizeFriendRecordMap(friendsById);
            const nextFriendsById =
                normalizeRosterSnapshotFriends(sourceFriendsById);
            const nextPresenceById: FriendPresenceById = { ...presenceById };
            let keptNewerEntries = false;
            if (
                generation !== undefined &&
                generation !== null &&
                generation === state.presenceGeneration
            ) {
                for (const [userId, existing] of Object.entries(
                    state.presenceById
                )) {
                    const incoming = nextPresenceById[userId];
                    const existingFriend = state.friendsById[userId];
                    if (
                        incoming &&
                        existingFriend &&
                        existing.rev > incoming.rev
                    ) {
                        nextFriendsById[userId] = existingFriend;
                        nextPresenceById[userId] = existing;
                        keptNewerEntries = true;
                    }
                }
            }
            // Guard against an empty `[]` ordering blanking a populated roster.
            const hasPrecomputedOrdering =
                !keptNewerEntries &&
                Array.isArray(orderedFriendIds) &&
                Array.isArray(onlineIds) &&
                Array.isArray(activeIds) &&
                Array.isArray(offlineIds) &&
                (Object.keys(sourceFriendsById).length === 0 ||
                    orderedFriendIds.length > 0);
            const ordering = hasPrecomputedOrdering
                ? { orderedFriendIds, onlineIds, activeIds, offlineIds }
                : buildRosterOrdering(nextFriendsById);
            return {
                currentUserId: normalizeUserId(currentUserId) || null,
                loadStatus: 'ready',
                detail,
                lastLoadedAt: new Date().toISOString(),
                friendsById: nextFriendsById,
                presenceById: nextPresenceById,
                presenceGeneration: generation ?? state.presenceGeneration,
                ...ordering
            };
        });
    },
    setRosterSeedSnapshot({
        currentUserId,
        friendsById,
        detail = ''
    }: FriendRosterSeedSnapshot) {
        const normalizedFriendsById =
            normalizeRosterSnapshotFriends(friendsById);
        const ordering = buildRosterOrdering(normalizedFriendsById);
        const nextState: FriendRosterState = {
            currentUserId: normalizeUserId(currentUserId) || null,
            loadStatus: 'running',
            detail,
            lastLoadedAt: new Date().toISOString(),
            friendsById: normalizedFriendsById,
            presenceById: {},
            presenceGeneration: null,
            orderedFriendIds: ordering.orderedFriendIds,
            onlineIds: ordering.onlineIds,
            activeIds: ordering.activeIds,
            offlineIds: ordering.offlineIds
        };
        set(nextState);
    },
    setRosterError(detail: string) {
        set((state) => ({
            ...state,
            loadStatus: 'error',
            detail,
            lastLoadedAt: new Date().toISOString()
        }));
    },
    applyFriendPatch({
        detail = '',
        ...entry
    }: FriendPatchEntry & { detail?: string }) {
        useFriendRosterStore.getState().applyFriendPatches([entry], detail);
    },
    applyFriendPatches(patches: FriendPatchEntry[] = [], detail = '') {
        set((state) => {
            if (!Array.isArray(patches) || patches.length === 0) {
                return state;
            }

            let changed = false;
            let orderingDirty = false;
            let friendsById = state.friendsById;
            let presenceById = state.presenceById;
            let presenceGeneration = state.presenceGeneration;

            for (const entry of patches) {
                const patch: FriendRecordInput = isRecord(entry?.patch)
                    ? entry.patch
                    : {};
                const normalizedUserId = normalizeUserId(
                    entry?.userId || patch?.id
                );
                if (
                    !normalizedUserId ||
                    isStalePresence(
                        presenceById,
                        presenceGeneration,
                        normalizedUserId,
                        entry
                    )
                ) {
                    continue;
                }
                if (entry.presence) {
                    const existingPresence = presenceById[normalizedUserId];
                    const nextPresence = replaceEqualDeep(
                        existingPresence,
                        entry.presence
                    );
                    if (nextPresence !== existingPresence) {
                        if (presenceById === state.presenceById) {
                            presenceById = { ...presenceById };
                        }
                        presenceById[normalizedUserId] = nextPresence;
                        changed = true;
                    }
                    if (entry.generation !== undefined) {
                        presenceGeneration = entry.generation;
                    }
                }

                const existingEntry = friendsById[normalizedUserId] ?? null;
                const nextStateBucket = resolveFriendStateBucket({
                    patch,
                    stateBucketAuthority: entry?.stateBucketAuthority,
                    existingEntry
                });
                const mergedUser: FriendRecordInput = {
                    ...(existingEntry ??
                        createFallbackFriendUser(
                            normalizedUserId,
                            existingEntry
                        )),
                    ...patch,
                    id: normalizedUserId
                };
                const normalizedEntry = normalizeFriendEntry(
                    mergedUser,
                    nextStateBucket,
                    existingEntry ?? {
                        id: normalizedUserId,
                        userId: normalizedUserId,
                        displayName: normalizedUserId,
                        friendNumber: 0
                    }
                );
                const entryOrderingDirty = friendEntryNeedsOrderingUpdate(
                    existingEntry,
                    normalizedEntry
                );
                if (!entryOrderingDirty && existingEntry === normalizedEntry) {
                    continue;
                }
                if (friendsById === state.friendsById) {
                    friendsById = { ...friendsById };
                }
                if (entryOrderingDirty) {
                    orderingDirty = true;
                }
                friendsById[normalizedUserId] = normalizedEntry;
                changed = true;
            }

            if (!changed) {
                return state;
            }

            const nextState = {
                ...state,
                ...(orderingDirty ? buildRosterOrdering(friendsById) : {}),
                friendsById,
                presenceById,
                presenceGeneration,
                loadStatus:
                    state.loadStatus === 'idle' ? 'ready' : state.loadStatus,
                detail: detail || state.detail,
                lastLoadedAt: new Date().toISOString()
            };
            return nextState;
        });
    },
    removeFriend(userId: string, detail = '') {
        set((state) => {
            const normalizedUserId = normalizeUserId(userId);
            if (!normalizedUserId || !state.friendsById[normalizedUserId]) {
                return state;
            }

            const friendsById: FriendRosterById = { ...state.friendsById };
            delete friendsById[normalizedUserId];
            const presenceById: FriendPresenceById = {
                ...state.presenceById
            };
            delete presenceById[normalizedUserId];

            const nextState = {
                ...state,
                ...buildRosterOrdering(friendsById),
                friendsById,
                presenceById,
                detail: detail || state.detail,
                lastLoadedAt: new Date().toISOString()
            };
            return nextState;
        });
    },
    resetRoster() {
        set(initialState);
    }
}));
