import {
    SOLID_USER_STATUS_DOT_CLASS_NAMES,
    USER_STATUS_INDICATOR_CLASS_NAMES,
    userStatusFromValue
} from '@/shared/utils/friendStatus';
import type { ParsedLocation } from '@/shared/utils/location';
import { isRecord } from '@/shared/utils/record';

import type { FriendRosterBucket } from './types';

export type PresencePlace = {
    location: ParsedLocation;
    travelingTo: ParsedLocation | null;
};

export type PresenceView =
    | {
          kind: 'online';
          place: PresencePlace;
          platform: string;
          onlineSinceMs: number | null;
      }
    | {
          kind: 'pendingOffline';
          place: PresencePlace;
          platform: string;
          onlineSinceMs: number | null;
          target: 'offline' | 'active';
          deadlineMs: number;
      }
    | { kind: 'active'; platform: string }
    | { kind: 'offline' };

export type PresenceEntry = { rev: number; view: PresenceView };

export function presenceSection(view: PresenceView): FriendRosterBucket {
    switch (view.kind) {
        case 'online':
        case 'pendingOffline':
            return 'online';
        case 'active':
            return 'active';
        case 'offline':
            return 'offline';
    }
}

export function presencePlace(view: PresenceView): PresencePlace | null {
    return view.kind === 'online' || view.kind === 'pendingOffline'
        ? view.place
        : null;
}

export function isPendingOffline(view: PresenceView): boolean {
    return view.kind === 'pendingOffline';
}

const PRESENCE_KINDS = new Set([
    'online',
    'pendingOffline',
    'active',
    'offline'
]);

export function isPresenceView(value: unknown): value is PresenceView {
    return (
        isRecord(value) &&
        typeof value.kind === 'string' &&
        PRESENCE_KINDS.has(value.kind)
    );
}

export function presenceOf(value: unknown): PresenceView | null {
    return isRecord(value) && isPresenceView(value.$presence)
        ? value.$presence
        : null;
}

function isPresenceEntry(value: unknown): value is PresenceEntry {
    return (
        isRecord(value) &&
        typeof value.rev === 'number' &&
        isPresenceView(value.view)
    );
}

export function parsePresenceById(
    value: unknown
): Record<string, PresenceEntry> {
    if (!isRecord(value)) {
        return {};
    }
    return Object.fromEntries(
        Object.entries(value).filter(
            (entry): entry is [string, PresenceEntry] =>
                isPresenceEntry(entry[1])
        )
    );
}

function hollowStatusDotClassName(status: string): string {
    switch (status) {
        case 'join me':
            return `${USER_STATUS_INDICATOR_CLASS_NAMES['join me']} border-[var(--status-joinme)] bg-background`;
        case 'ask me':
            return `${USER_STATUS_INDICATOR_CLASS_NAMES['ask me']} border-[var(--status-askme)] bg-background`;
        case 'busy':
            return `${USER_STATUS_INDICATOR_CLASS_NAMES.busy} border-[var(--status-busy)] bg-background`;
        default:
            return `${USER_STATUS_INDICATOR_CLASS_NAMES.active} border-[var(--status-online)] bg-background`;
    }
}

export function presenceDotClassName(
    view: PresenceView | null | undefined,
    status: unknown
): string {
    const friendStatus = userStatusFromValue(status);
    switch (view?.kind) {
        case 'offline':
        case 'pendingOffline':
            return SOLID_USER_STATUS_DOT_CLASS_NAMES.offline;
        case 'active':
            return hollowStatusDotClassName(friendStatus);
        case 'online':
            return friendStatus && friendStatus !== 'offline'
                ? SOLID_USER_STATUS_DOT_CLASS_NAMES[friendStatus]
                : '';
        default:
            return '';
    }
}

export function presenceStatusKey(view: PresenceView, status: unknown): string {
    const friendStatus = userStatusFromValue(status);
    if (
        view.kind === 'offline' ||
        view.kind === 'pendingOffline' ||
        friendStatus === 'offline'
    ) {
        return 'offline';
    }
    if (
        friendStatus === 'join me' ||
        friendStatus === 'ask me' ||
        friendStatus === 'busy'
    ) {
        return friendStatus;
    }
    return view.kind === 'active' ? 'state-active' : 'active';
}

export function presenceLocationTag(
    view: PresenceView,
    {
        preferTraveling = true,
        requireInstance = false
    }: { preferTraveling?: boolean; requireInstance?: boolean } = {}
): string {
    const place = presencePlace(view);
    if (!place) {
        return requireInstance ? '' : 'offline';
    }
    const { location, travelingTo } = place;
    if (location.isPrivate) {
        return requireInstance ? '' : 'private';
    }
    if (location.isTraveling) {
        if (preferTraveling && travelingTo?.isRealInstance) {
            return travelingTo.tag;
        }
        return requireInstance ? '' : 'traveling';
    }
    if (!location.isRealInstance) {
        return '';
    }
    return requireInstance && !(location.worldId && location.instanceId)
        ? ''
        : location.tag;
}

export function presenceLiveInstanceTag(
    view: PresenceView,
    { preferTraveling = true }: { preferTraveling?: boolean } = {}
): string {
    return view.kind === 'online'
        ? presenceLocationTag(view, { preferTraveling, requireInstance: true })
        : '';
}

export function presenceTravelingTag(view: PresenceView): string {
    const place = presencePlace(view);
    return place?.location.isTraveling && place.travelingTo?.isRealInstance
        ? place.travelingTo.tag
        : '';
}

export function presenceCanRequestInvite(view: PresenceView): boolean {
    return view.kind === 'online';
}

export function localGamePresence(
    location: ParsedLocation,
    platform: string
): PresenceView {
    return {
        kind: 'online',
        place: { location, travelingTo: null },
        platform,
        onlineSinceMs: null
    };
}
