import { describe, expect, it } from 'vitest';

import {
    activePresence,
    onlinePresence,
    pendingPresence
} from '@/test/presenceFixtures';

import {
    buildSameInstanceGroups,
    readFriendRefLocation,
    readFriendStatusSource,
    resolveSidebarStatusDotClassName,
    sortRows,
    toLegacyFriendSortRow
} from './friendsSidebarModel';

describe('friendsSidebarModel time in instance sorting', () => {
    it('orders online friends by their stay clock and keeps possibly offline friends last', () => {
        const friend = (id: string, pending = false) => ({
            id,
            displayName: id,
            $presence: pending
                ? pendingPresence('wrld_a:1')
                : onlinePresence('wrld_a:1')
        });
        const staySince: Record<string, number> = {
            usr_long: 1_000,
            usr_short: 5_000,
            usr_pending: 9_000
        };

        expect(
            sortRows(
                [
                    friend('usr_long'),
                    friend('usr_pending', true),
                    friend('usr_short')
                ],
                { sidebarSortMethod1: 'Sort by Time in Instance' },
                { staySinceMs: (friendId) => staySince[friendId] }
            ).map((row) => row.id)
        ).toEqual(['usr_short', 'usr_long', 'usr_pending']);
    });
});

describe('friendsSidebarModel same-instance groups', () => {
    it('groups one friend with the current user but not a solo friend elsewhere', () => {
        const currentLocation = 'wrld_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:123';
        const otherLocation = 'wrld_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:456';
        const friendWithCurrentUser = {
            id: 'usr_1',
            displayName: 'With current user',
            state: 'online',
            location: currentLocation,
            $location_at: 1
        };
        const soloElsewhere = {
            id: 'usr_2',
            displayName: 'Solo elsewhere',
            state: 'online',
            location: otherLocation,
            $location_at: 1
        };

        expect(
            buildSameInstanceGroups(
                [friendWithCurrentUser, soloElsewhere],
                {},
                { location: currentLocation }
            )
        ).toEqual([
            {
                location: currentLocation,
                rows: [friendWithCurrentUser],
                isCurrentInstance: true
            }
        ]);
    });
});

describe('friendsSidebarModel friend status source', () => {
    it('uses top-level roster presence over stale nested ref presence', () => {
        const friend = {
            id: 'usr_friend',
            displayName: 'Friend',
            state: 'online',
            location: 'wrld_live:123',
            status: 'join me',
            ref: {
                id: 'usr_friend',
                displayName: 'Friend',
                state: 'offline',
                location: 'offline',
                status: 'active'
            }
        };

        const source = readFriendStatusSource(friend);
        const sortRow = toLegacyFriendSortRow(friend);

        expect(source).toMatchObject({
            state: 'online',
            location: 'wrld_live:123',
            status: 'join me'
        });
        expect(readFriendRefLocation(friend)).toBe('wrld_live:123');
        expect(sortRow.ref).toMatchObject({
            state: 'online',
            location: 'wrld_live:123',
            status: 'join me'
        });
    });
});

describe('friendsSidebarModel current user status dot', () => {
    it('uses the solid account status while the realtime view is online', () => {
        const currentUser = {
            id: 'usr_self',
            status: 'busy',
            $presence: onlinePresence('wrld_local:1')
        };

        expect(resolveSidebarStatusDotClassName(currentUser, currentUser)).toBe(
            'user-status-indicator busy bg-[var(--status-busy)]'
        );
    });

    it('uses the hollow account status while the realtime view is only active', () => {
        const currentUser = {
            id: 'usr_self',
            status: 'busy',
            $presence: activePresence()
        };

        expect(resolveSidebarStatusDotClassName(currentUser, currentUser)).toBe(
            'user-status-indicator busy border-[var(--status-busy)] bg-background'
        );
    });
});

describe('friendsSidebarModel ordinary friend status dot', () => {
    const currentUser = { id: 'usr_self' };

    it('uses the solid status for an ordinary online friend', () => {
        const friend = {
            id: 'usr_friend',
            status: 'busy',
            $presence: onlinePresence()
        };

        expect(resolveSidebarStatusDotClassName(friend, currentUser)).toBe(
            'user-status-indicator busy bg-[var(--status-busy)]'
        );
    });

    it('keeps an ordinary pending friend offline', () => {
        const friend = {
            id: 'usr_friend',
            status: 'join me',
            $presence: pendingPresence()
        };

        expect(resolveSidebarStatusDotClassName(friend, currentUser)).toBe(
            'user-status-indicator offline bg-[var(--status-offline)]'
        );
    });
});
