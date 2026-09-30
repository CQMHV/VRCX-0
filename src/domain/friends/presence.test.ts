import { describe, expect, it } from 'vitest';

import { parseLocation } from '@/shared/utils/location';

import {
    isPendingOffline,
    parsePresenceById,
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
});
