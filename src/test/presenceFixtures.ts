import type { PresenceView } from '@/domain/friends/presence';
import { parseLocation } from '@/shared/utils/location';

export function onlinePresence(
    tag = 'wrld_friend:123',
    platform = 'standalonewindows'
): PresenceView {
    return {
        kind: 'online',
        place: { location: parseLocation(tag), travelingTo: null },
        platform
    };
}

export function pendingPresence(tag = 'wrld_friend:123'): PresenceView {
    return {
        kind: 'pendingOffline',
        place: { location: parseLocation(tag), travelingTo: null },
        platform: 'standalonewindows',
        target: 'offline',
        deadlineMs: 0
    };
}

export function activePresence(platform = 'web'): PresenceView {
    return { kind: 'active', platform };
}

export const offlinePresence: PresenceView = { kind: 'offline' };
