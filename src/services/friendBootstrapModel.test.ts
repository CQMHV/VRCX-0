import { describe, expect, it } from 'vitest';

import {
    getDisplayName,
    normalizeFriendsById,
    normalizeUserId
} from './friendBootstrapModel';

describe('friendBootstrapModel pure normalizers', () => {
    it('normalizes ids and friend maps defensively', () => {
        expect(normalizeUserId(' usr_friend ')).toBe('usr_friend');
        expect(normalizeUserId(null)).toBe('');
        expect(
            normalizeFriendsById({
                usr_a: { id: 'usr_a' },
                usr_b: null,
                usr_c: 'bad'
            })
        ).toEqual({
            usr_a: { id: 'usr_a' }
        });
    });

    it('derives display names from profile fields', () => {
        expect(
            getDisplayName({
                id: 'usr_id',
                username: 'Username'
            })
        ).toBe('Username');
    });
});
