import type { ParsedLocation } from '@/shared/utils/location';
import { isRecord } from '@/shared/utils/record';

import type { FriendRosterBucket } from './types';

export type PresencePlace = {
    location: ParsedLocation;
    travelingTo: ParsedLocation | null;
};

export type PresenceView =
    | { kind: 'online'; place: PresencePlace; platform: string }
    | {
          kind: 'pendingOffline';
          place: PresencePlace;
          platform: string;
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

function isPresenceEntry(value: unknown): value is PresenceEntry {
    return (
        isRecord(value) &&
        typeof value.rev === 'number' &&
        isRecord(value.view) &&
        typeof value.view.kind === 'string' &&
        PRESENCE_KINDS.has(value.view.kind)
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
