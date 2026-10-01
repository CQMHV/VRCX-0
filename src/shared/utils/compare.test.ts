import { describe, expect, it } from 'vitest';

import { onlinePresence, travelingPresence } from '@/test/presenceFixtures';

import {
    compareByLastActive,
    compareByLastSeen,
    compareByLocationAt,
    compareByPrivate,
    compareByStatus
} from './compare';

describe('compareByStatus', () => {
    it('returns 0 when either ref is undefined', () => {
        expect(compareByStatus({}, {})).toBe(0);
        expect(compareByStatus({ ref: { status: 'active' } }, {})).toBe(0);
    });

    it('returns 0 for identical statuses', () => {
        const a = { ref: { state: 'online', status: 'active' } };
        const b = { ref: { state: 'online', status: 'active' } };
        expect(compareByStatus(a, b)).toBe(0);
    });

    it('sorts offline state last regardless of status value', () => {
        const offline = { ref: { state: 'offline', status: 'join me' } };
        const online = { ref: { state: 'online', status: 'busy' } };
        expect(compareByStatus(offline, online)).toBeGreaterThan(0);
    });

    it('sorts online before offline in both directions (antisymmetric)', () => {
        const onlineBusy = { ref: { state: 'online', status: 'busy' } };
        const offlineJoinMe = { ref: { state: 'offline', status: 'join me' } };
        expect(compareByStatus(onlineBusy, offlineJoinMe)).toBeLessThan(0);
        expect(compareByStatus(offlineJoinMe, onlineBusy)).toBeGreaterThan(0);
        expect(compareByStatus(onlineBusy, offlineJoinMe)).toBe(
            -compareByStatus(offlineJoinMe, onlineBusy)
        );
    });

    it('orders by status priority when neither is offline state', () => {
        const joinMe = { ref: { state: 'online', status: 'join me' } };
        const busy = { ref: { state: 'online', status: 'busy' } };
        expect(compareByStatus(joinMe, busy)).toBeLessThan(0);
        expect(compareByStatus(busy, joinMe)).toBeGreaterThan(0);
    });

    it('orders two offline friends by status priority', () => {
        const joinMe = { ref: { state: 'offline', status: 'join me' } };
        const busy = { ref: { state: 'offline', status: 'busy' } };
        expect(compareByStatus(joinMe, busy)).toBeLessThan(0);
        expect(compareByStatus(busy, joinMe)).toBeGreaterThan(0);
    });

    it('is antisymmetric for two offline friends with differing status', () => {
        const a = { ref: { state: 'offline', status: 'ask me' } };
        const b = { ref: { state: 'offline', status: 'active' } };
        expect(compareByStatus(a, b)).toBe(-compareByStatus(b, a));
    });

    it('returns 0 for two offline friends with identical status', () => {
        const a = { ref: { state: 'offline', status: 'busy' } };
        const b = { ref: { state: 'offline', status: 'busy' } };
        expect(compareByStatus(a, b)).toBe(0);
    });

    it('sorts an all-offline list stably and idempotently', () => {
        const rows = [
            { id: 'busy', ref: { state: 'offline', status: 'busy' } },
            { id: 'joinMe', ref: { state: 'offline', status: 'join me' } },
            { id: 'askMe', ref: { state: 'offline', status: 'ask me' } },
            { id: 'active', ref: { state: 'offline', status: 'active' } }
        ];
        const sorted = [...rows].sort(compareByStatus);
        expect(sorted.map((row) => row.id)).toEqual([
            'joinMe',
            'active',
            'askMe',
            'busy'
        ]);
        const resorted = [...sorted].sort(compareByStatus);
        expect(resorted.map((row) => row.id)).toEqual(
            sorted.map((row) => row.id)
        );
    });
});

describe('compareByLastSeen', () => {
    it('sorts the most recently seen friend first', () => {
        const earlier = '2024-01-01T00:00:00Z';
        const later = '2024-01-02T00:00:00Z';
        expect(compareByLastSeen(later, earlier)).toBeLessThan(0);
        expect(compareByLastSeen(earlier, later)).toBeGreaterThan(0);
        expect(compareByLastSeen(earlier, earlier)).toBe(0);
    });

    it('sorts friends never seen after the ones seen', () => {
        expect(compareByLastSeen('2024-01-01T00:00:00Z', '')).toBeLessThan(0);
        expect(
            compareByLastSeen(undefined, '2024-01-01T00:00:00Z')
        ).toBeGreaterThan(0);
        expect(compareByLastSeen(undefined, '')).toBe(0);
    });
});

describe('compareByLastActive', () => {
    it('returns 0 when ref is undefined', () => {
        expect(compareByLastActive({}, {})).toBe(0);
    });

    it('compares by last_activity when neither is online', () => {
        const recent = {
            state: 'offline',
            ref: { last_activity: '2024-01-02T00:00:00Z' }
        };
        const older = {
            state: 'offline',
            ref: { last_activity: '2024-01-01T00:00:00Z' }
        };
        expect(compareByLastActive(recent, older)).toBeLessThan(0);
    });

    it('ranks online friends by when they came online, unknown last', () => {
        const onlineSince = (onlineSinceMs: number | null) => {
            const $presence = { ...onlinePresence(), onlineSinceMs };
            return { $presence, ref: { $presence } };
        };
        const earlier = onlineSince(1_000);
        const later = onlineSince(2_000);
        const unknown = onlineSince(null);
        expect(compareByLastActive(later, earlier)).toBeLessThan(0);
        expect(compareByLastActive(earlier, later)).toBeGreaterThan(0);
        expect(compareByLastActive(earlier, unknown)).toBeLessThan(0);
        expect(compareByLastActive(unknown, earlier)).toBeGreaterThan(0);
        expect(compareByLastActive(unknown, onlineSince(null))).toBe(0);
    });
});

describe('compareByLocationAt', () => {
    it('returns 0 when both are traveling', () => {
        const a = { $presence: travelingPresence() };
        const b = { $presence: travelingPresence() };
        expect(compareByLocationAt(a, b, 1_000, 2_000)).toBe(0);
    });

    it('sorts traveling after non-traveling', () => {
        const traveling = { $presence: travelingPresence() };
        const real = { $presence: onlinePresence('wrld_abc:12345') };
        expect(compareByLocationAt(traveling, real)).toBeGreaterThan(0);
        expect(compareByLocationAt(real, traveling)).toBeLessThan(0);
    });

    it('sorts by the stay start ascending when neither is traveling', () => {
        const a = { $presence: onlinePresence('wrld_abc:1') };
        const b = { $presence: onlinePresence('wrld_abc:2') };
        expect(compareByLocationAt(a, b, 1_000, 2_000)).toBeLessThan(0);
        expect(compareByLocationAt(b, a, 2_000, 1_000)).toBeGreaterThan(0);
    });

    it('returns 0 for equal stay starts', () => {
        const a = { $presence: onlinePresence('wrld_abc:1') };
        const b = { $presence: onlinePresence('wrld_abc:2') };
        expect(compareByLocationAt(a, b, 1_000, 1_000)).toBe(0);
    });
});

describe('compareByPrivate', () => {
    it('returns 0 when either ref is undefined', () => {
        expect(compareByPrivate({}, {})).toBe(0);
        expect(
            compareByPrivate(
                { ref: { $presence: onlinePresence('private') } },
                {}
            )
        ).toBe(0);
    });

    it('sorts private location after non-private', () => {
        const priv = { ref: { $presence: onlinePresence('private') } };
        const pub = { ref: { $presence: onlinePresence('wrld_abc:12345') } };
        expect(compareByPrivate(priv, pub)).toBeGreaterThan(0);
        expect(compareByPrivate(pub, priv)).toBeLessThan(0);
    });

    it('returns 0 when both are private', () => {
        const a = { ref: { $presence: onlinePresence('private') } };
        const b = { ref: { $presence: onlinePresence('private') } };
        expect(compareByPrivate(a, b)).toBe(0);
    });

    it('returns 0 when neither is private', () => {
        const a = { ref: { $presence: onlinePresence('wrld_abc:1') } };
        const b = { ref: { $presence: onlinePresence('wrld_abc:2') } };
        expect(compareByPrivate(a, b)).toBe(0);
    });
});
