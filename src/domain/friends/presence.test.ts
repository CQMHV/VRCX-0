import { describe, expect, it } from 'vitest';

import {
    SOLID_USER_STATUS_DOT_CLASS_NAMES,
    USER_STATUS_INDICATOR_CLASS_NAMES
} from '@/shared/utils/friendStatus';
import { parseLocation } from '@/shared/utils/location';

import {
    isPendingOffline,
    parsePresenceById,
    presenceDotClassName,
    presencePlace,
    presenceSection,
    type PresenceView
} from './presence';

const place = {
    location: parseLocation('wrld_a:1'),
    travelingTo: null
};

const online: PresenceView = { kind: 'online', place, platform: 'android' };
const pending: PresenceView = {
    kind: 'pendingOffline',
    place,
    platform: 'android',
    target: 'offline',
    deadlineMs: 5_000
};

describe('presence', () => {
    it('keeps pending friends in the online section with their held place', () => {
        expect(presenceSection(online)).toBe('online');
        expect(presenceSection(pending)).toBe('online');
        expect(presenceSection({ kind: 'active', platform: 'web' })).toBe(
            'active'
        );
        expect(presenceSection({ kind: 'offline' })).toBe('offline');

        expect(isPendingOffline(pending)).toBe(true);
        expect(isPendingOffline(online)).toBe(false);
        expect(presencePlace(pending)).toBe(place);
        expect(presencePlace({ kind: 'offline' })).toBeNull();
    });

    it('parses only well-formed presence entries from raw snapshots', () => {
        expect(
            parsePresenceById({
                usr_a: { rev: 3, view: { kind: 'offline' } },
                usr_b: { rev: '3', view: { kind: 'offline' } },
                usr_c: { rev: 1, view: { kind: 'sleeping' } },
                usr_d: null
            })
        ).toEqual({ usr_a: { rev: 3, view: { kind: 'offline' } } });
        expect(parsePresenceById(undefined)).toEqual({});
    });

    it('derives the status dot from presence and the chosen status', () => {
        const active: PresenceView = { kind: 'active', platform: 'web' };
        expect(presenceDotClassName(online, 'join me')).toBe(
            SOLID_USER_STATUS_DOT_CLASS_NAMES['join me']
        );
        expect(presenceDotClassName(online, 'active')).toBe(
            SOLID_USER_STATUS_DOT_CLASS_NAMES.active
        );
        expect(presenceDotClassName(online, '')).toBe('');
        expect(presenceDotClassName(pending, 'join me')).toBe(
            SOLID_USER_STATUS_DOT_CLASS_NAMES.offline
        );
        expect(presenceDotClassName({ kind: 'offline' }, 'busy')).toBe(
            SOLID_USER_STATUS_DOT_CLASS_NAMES.offline
        );
        expect(presenceDotClassName(active, 'ask me')).toBe(
            `${USER_STATUS_INDICATOR_CLASS_NAMES['ask me']} border-[var(--status-askme)] bg-background`
        );
        expect(presenceDotClassName(active, '')).toBe(
            `${USER_STATUS_INDICATOR_CLASS_NAMES.active} border-[var(--status-online)] bg-background`
        );
        expect(presenceDotClassName(undefined, 'active')).toBe('');
    });
});
