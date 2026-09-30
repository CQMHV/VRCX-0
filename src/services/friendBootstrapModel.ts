import type {
    FriendPresenceById,
    FriendRosterInputById
} from '@/domain/friends/types';
import { isRecord } from '@/shared/utils/record';

export type FriendBootstrapSnapshot = Record<string, unknown> & {
    friendsById?: FriendRosterInputById;
    presenceById?: FriendPresenceById;
    generation?: number | null;
    detail?: string;
};
export type CurrentUserFriendSnapshot = Record<string, unknown> & {
    id?: string;
};
export type FriendBootstrapOptions = {
    userId?: string;
    endpoint?: string;
    websocket?: string;
    currentUserSnapshot?: CurrentUserFriendSnapshot | null;
    preserveLoadedState?: boolean;
};
export type FriendBootstrapResult = {
    userId: string;
    count: number;
    detail: string;
    stale: boolean;
};

export function normalizeUserId(value: unknown) {
    return typeof value === 'string'
        ? value.trim()
        : String(value ?? '').trim();
}

export { isRecord };

export function normalizeFriendsById(value: unknown): FriendRosterInputById {
    if (!isRecord(value)) {
        return {};
    }

    const friendsById: FriendRosterInputById = {};
    for (const [userId, friend] of Object.entries(value)) {
        if (isRecord(friend)) {
            friendsById[userId] = friend;
        }
    }
    return friendsById;
}

export function getDisplayName(
    user: Record<string, unknown> | null | undefined
) {
    return (
        normalizeUserId(user?.displayName) ||
        normalizeUserId(user?.username) ||
        normalizeUserId(user?.id)
    );
}
