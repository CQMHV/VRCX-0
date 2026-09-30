import { describe, expect, it } from 'vitest';

import {
    activePresence,
    offlinePresence,
    onlinePresence,
    pendingPresence
} from '@/test/presenceFixtures';

import { resolveFriendLocationTimeEpoch } from './useFriendLocationTimeEpoch';

const entry = {
    location: 'wrld_test:1',
    sinceMs: 1_700_000_000_000,
    source: 'realtime' as const
};

describe('resolveFriendLocationTimeEpoch', () => {
    it('keeps local mode visible even when the remote friend is offline', () => {
        const localEntry = { ...entry, source: 'gameLog' as const };
        expect(
            resolveFriendLocationTimeEpoch(
                { $presence: offlinePresence },
                localEntry,
                entry.location
            )
        ).toBe(entry.sinceMs);
        expect(
            resolveFriendLocationTimeEpoch(null, localEntry, entry.location)
        ).toBe(0);
    });

    it('returns the backend time only for an online matching friend', () => {
        expect(
            resolveFriendLocationTimeEpoch(
                { $presence: onlinePresence(entry.location) },
                entry,
                'wrld_test:1'
            )
        ).toBe(entry.sinceMs);
    });

    it('rejects mismatched locations', () => {
        expect(
            resolveFriendLocationTimeEpoch(
                { $presence: onlinePresence(entry.location) },
                entry,
                'wrld_other:2'
            )
        ).toBe(0);
    });

    it('keeps the backend time while an offline transition is pending', () => {
        const pendingFriend = { $presence: pendingPresence(entry.location) };

        expect(
            resolveFriendLocationTimeEpoch(pendingFriend, entry, entry.location)
        ).toBe(entry.sinceMs);
    });

    it('rejects offline, active, and removed friends', () => {
        expect(
            resolveFriendLocationTimeEpoch(
                { $presence: offlinePresence },
                entry,
                entry.location
            )
        ).toBe(0);
        expect(
            resolveFriendLocationTimeEpoch(
                { $presence: activePresence() },
                entry,
                entry.location
            )
        ).toBe(0);
        expect(
            resolveFriendLocationTimeEpoch(null, entry, entry.location)
        ).toBe(0);
    });
});
