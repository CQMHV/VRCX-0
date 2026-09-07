// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        i18n: { language: 'en' },
        t: (key: string) => key.split('.').at(-1) || key
    })
}));

vi.mock('../../EntityDialogScaffold', () => ({
    EntityDialogTabContent: ({ children }: { children: ReactNode }) => (
        <div>{children}</div>
    )
}));

vi.mock('@/services/entityMediaService', () => ({ openExternalLink: vi.fn() }));
import { openExternalLink } from '@/services/entityMediaService';

import { AvatarDialogPerformanceTab } from './AvatarDialogPerformanceTab';

afterEach(cleanup);

describe('AvatarDialogPerformanceTab', () => {
    it('shows a loading state while detailed analysis is requested', () => {
        render(
            <AvatarDialogPerformanceTab
                platformInfo={{ pc: {}, android: {}, ios: {} }}
                fileAnalysis={{}}
                loading
            />
        );

        expect(screen.getByText('analysis_loading')).toBeTruthy();
    });

    it('explains when detailed analysis is not ready yet', () => {
        render(
            <AvatarDialogPerformanceTab
                platformInfo={{ pc: {}, android: {}, ios: {} }}
                fileAnalysis={{}}
                pending
            />
        );

        expect(screen.getByText('analysis_pending')).toBeTruthy();
    });

    it('renders completed platforms while another platform is pending', () => {
        render(
            <AvatarDialogPerformanceTab
                platformInfo={{
                    pc: { platform: 'standalonewindows' },
                    android: { platform: 'android' },
                    ios: {}
                }}
                fileAnalysis={{
                    standalonewindows: { _fileSize: '12.50 MB' }
                }}
                pending
            />
        );

        expect(screen.getByText('analysis_pending')).toBeTruthy();
        expect(screen.getByText('PC')).toBeTruthy();
        expect(screen.getByText('12.50 MB')).toBeTruthy();
        expect(screen.queryByText('Android')).toBeNull();
    });

    it('renders the platform rating, sizes, and detailed avatar stats', () => {
        render(
            <AvatarDialogPerformanceTab
                platformInfo={{
                    pc: {
                        platform: 'standalonewindows',
                        performanceRating: 'Good'
                    },
                    android: {},
                    ios: {}
                }}
                fileAnalysis={{
                    standalonewindows: {
                        performanceRating: 'VeryPoor',
                        _fileSize: '12.50 MB',
                        _uncompressedSize: '48.25 MB',
                        _totalTextureUsage: '32.00 MB',
                        avatarStats: {
                            totalPolygons: 123456,
                            totalVertices: 65432,
                            totalTextureUsage: 32 * 1048576,
                            raycastCount: 4,
                            particleTrailsEnabled: true,
                            particleCollisionEnabled: false
                        }
                    }
                }}
            />
        );

        expect(screen.getByText('PC')).toBeTruthy();
        expect(screen.getByText('rating: VeryPoor')).toBeTruthy();
        expect(screen.getByText('12.50 MB')).toBeTruthy();
        expect(screen.getByText('48.25 MB')).toBeTruthy();
        expect(screen.getByText('32.00 MB / 150 MB')).toBeTruthy();
        expect(screen.getByText('123,456 / 70,000').className).toContain(
            'text-red-700'
        );
        expect(screen.getByText('65,432')).toBeTruthy();
        expect(screen.getByText('4 / 15')).toBeTruthy();
        expect(screen.getByText('yes / yes').className).toContain(
            'text-amber-700'
        );
        expect(screen.getByText('no / yes').className).toContain(
            'text-green-700'
        );
        fireEvent.click(screen.getByText('pc_rules'));
        expect(openExternalLink).toHaveBeenCalledWith(
            'https://creators.vrchat.com/avatars/avatar-performance-ranking-system/#pc-limits'
        );
    });

    it('keeps the rating visible when detailed analysis is unavailable', () => {
        render(
            <AvatarDialogPerformanceTab
                platformInfo={{
                    pc: {},
                    android: {
                        platform: 'android',
                        performanceRating: 'Medium'
                    },
                    ios: {}
                }}
                fileAnalysis={{}}
            />
        );

        expect(screen.getByText('Android')).toBeTruthy();
        expect(screen.getByText('rating: Medium')).toBeTruthy();
        expect(screen.getByText('analysis_unavailable')).toBeTruthy();
    });

    it.each(['android', 'ios'] as const)(
        'renders mobile limits and documentation for %s',
        (platform) => {
            render(
                <AvatarDialogPerformanceTab
                    platformInfo={{ pc: {}, android: {}, ios: {} }}
                    fileAnalysis={{
                        [platform]: {
                            avatarStats: { totalPolygons: 18000, lightCount: 0 }
                        }
                    }}
                />
            );
            expect(screen.getByText('18,000 / 20,000').className).toContain(
                'text-orange-700'
            );
            expect(
                screen.getAllByText('mobile_removed').length
            ).toBeGreaterThan(0);
            expect(
                screen.getByText('mobile_rules').getAttribute('href')
            ).toContain('#mobile-limits');
        }
    );
});
