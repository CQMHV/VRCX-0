import { describe, expect, it } from 'vitest';

import {
    assessPerformanceStat,
    performanceDocsUrl
} from './avatarPerformanceLimits';

describe('avatar performance rank thresholds', () => {
    it.each([
        ['totalPolygons', 272878, 70000, 'VeryPoor'],
        ['meshParticleMaxPolygons', 1584, 5000, 'Medium'],
        ['physicsColliders', 2, 8, 'Medium'],
        ['physicsRigidbodies', 1, 8, 'Good'],
        ['lightCount', 1, 1, 'Poor'],
        ['particleTrailsEnabled', true, true, 'Medium'],
        ['particleCollisionEnabled', false, true, 'Excellent'],
        ['bounds', [2, 2.19, 2], [5, 6, 5], 'Excellent'],
        ['totalTextureUsage', 58.99 * 1048576, 150, 'Good']
    ])('matches the in-game PC example for %s', (key, value, maximum, rank) => {
        expect(assessPerformanceStat(key as string, value, 'pc')).toEqual({
            maximum,
            rank
        });
    });

    it('keeps exact boundaries in the better rank and checks every bounds axis', () => {
        expect(assessPerformanceStat('totalPolygons', 70000, 'pc').rank).toBe(
            'Good'
        );
        expect(assessPerformanceStat('totalPolygons', 70001, 'pc').rank).toBe(
            'VeryPoor'
        );
        expect(assessPerformanceStat('bounds', [5, 6, 5], 'pc').rank).toBe(
            'Medium'
        );
        expect(assessPerformanceStat('bounds', [5, 6.01, 5], 'pc').rank).toBe(
            'VeryPoor'
        );
    });

    it.each(['android', 'ios'] as const)(
        'uses mobile thresholds on %s',
        (platform) => {
            expect(
                assessPerformanceStat('totalPolygons', 15000, platform)
            ).toEqual({ maximum: 20000, rank: 'Medium' });
            expect(
                assessPerformanceStat('physBoneComponentCount', 9, platform)
                    .rank
            ).toBe('VeryPoor');
            expect(
                assessPerformanceStat('particleTrailsEnabled', true, platform)
                    .rank
            ).toBe('Poor');
            expect(assessPerformanceStat('lightCount', 0, platform)).toEqual({
                removed: true
            });
            expect(performanceDocsUrl(platform)).toContain('#mobile-limits');
        }
    );

    it('does not fabricate ratings for missing, malformed or unranked stats', () => {
        for (const value of [undefined, null, NaN, Infinity, -1, '12', false]) {
            expect(assessPerformanceStat('totalPolygons', value, 'pc')).toEqual(
                {}
            );
        }
        expect(assessPerformanceStat('totalVertices', 500, 'pc')).toEqual({});
        expect(assessPerformanceStat('bounds', [1, 2], 'pc')).toEqual({});
        expect(assessPerformanceStat('particleTrailsEnabled', 1, 'pc')).toEqual(
            {}
        );
    });
});
