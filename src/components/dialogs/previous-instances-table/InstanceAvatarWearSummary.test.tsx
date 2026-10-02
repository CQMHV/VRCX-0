// @vitest-environment jsdom

import {
    cleanup,
    render,
    renderHook,
    screen,
    waitFor
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    appAvatarWearSegments: vi.fn()
}));

vi.mock('@/platform/tauri/bindings', () => ({
    commands: {
        appAvatarWearSegments: mocks.appAvatarWearSegments
    }
}));

import type { AvatarWearSegment } from '@/platform/tauri/bindings';
import { useRuntimeStore } from '@/state/runtimeStore';

import {
    InstanceAvatarWearSummary,
    useInstanceAvatarWearSegments
} from './InstanceAvatarWearSummary';
import type { PreviousInstanceVisitWindow } from './previousInstancesRows';

function Harness({
    location,
    visitWindow
}: {
    location: string;
    visitWindow: PreviousInstanceVisitWindow;
}) {
    const segments = useInstanceAvatarWearSegments(location, visitWindow);
    return <InstanceAvatarWearSummary segments={segments} label="Avatars" />;
}

function segment(
    avatarId: string,
    startedAtMs: number,
    endedAtMs: number
): AvatarWearSegment {
    return {
        avatarId,
        name: `Avatar ${avatarId}`,
        thumbnailImageUrl: '',
        imageUrl: '',
        startedAtMs,
        endedAtMs
    };
}

function setRuntime({
    currentLocation = '',
    isGameRunning = false,
    snapshot = null
}: {
    currentLocation?: string;
    isGameRunning?: boolean;
    snapshot?: Record<string, unknown> | null;
} = {}) {
    const state = useRuntimeStore.getState();
    useRuntimeStore.setState({
        auth: {
            ...state.auth,
            currentUserId: 'usr_me',
            currentUserSnapshot: snapshot
        },
        gameState: { ...state.gameState, currentLocation, isGameRunning }
    });
}

describe('InstanceAvatarWearSummary', () => {
    beforeEach(() => {
        cleanup();
        mocks.appAvatarWearSegments.mockReset();
        setRuntime();
    });

    it('stacks the first three avatars in wear order and counts the rest', async () => {
        mocks.appAvatarWearSegments.mockResolvedValue([
            segment('a', 1000, 2000),
            segment('b', 2000, 3000),
            segment('c', 3000, 4000),
            segment('a', 4000, 5000),
            segment('d', 5000, 6000)
        ]);

        render(
            <Harness
                location="wrld_1:1"
                visitWindow={{ startMs: 1000, endMs: 6000 }}
            />
        );

        expect(await screen.findByText('+2')).toBeTruthy();
        expect(
            screen
                .getAllByRole('button')
                .map((button) => button.getAttribute('aria-label'))
        ).toEqual(['Avatar a', 'Avatar b', 'Avatar c']);
        expect(mocks.appAvatarWearSegments).toHaveBeenCalledWith(
            'usr_me',
            1000,
            6000
        );
    });

    it('spans the visit from start to end, splitting only at avatar changes', async () => {
        mocks.appAvatarWearSegments.mockResolvedValue([
            segment('a', 2500, 3000),
            segment('b', 4000, 4500)
        ]);

        const { result } = renderHook(() =>
            useInstanceAvatarWearSegments('wrld_1:1', {
                startMs: 1000,
                endMs: 6000
            })
        );

        await waitFor(() => expect(result.current).toHaveLength(2));
        expect(
            result.current.map((worn) => [
                worn.avatarId,
                worn.startedAtMs,
                worn.endedAtMs
            ])
        ).toEqual([
            ['a', 1000, 4000],
            ['b', 4000, 6000]
        ]);
    });

    it('renders nothing when the visit has no recorded avatars', async () => {
        mocks.appAvatarWearSegments.mockResolvedValue([]);

        const { container } = render(
            <Harness
                location="wrld_1:1"
                visitWindow={{ startMs: 1000, endMs: 6000 }}
            />
        );

        await waitFor(() =>
            expect(mocks.appAvatarWearSegments).toHaveBeenCalled()
        );
        expect(container.textContent).toBe('');
    });

    it('extends an ongoing visit with the avatar currently worn', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(9000);
        setRuntime({
            currentLocation: 'wrld_1:1',
            isGameRunning: true,
            snapshot: {
                currentAvatar: 'b',
                currentAvatarName: 'Avatar b',
                $previousAvatarSwapTime: 5000
            }
        });
        mocks.appAvatarWearSegments.mockResolvedValue([
            segment('a', 1000, 5000)
        ]);

        render(
            <Harness
                location="wrld_1:1"
                visitWindow={{ startMs: 1000, endMs: 1000 }}
            />
        );

        expect(
            await screen.findByRole('button', { name: 'Avatar b' })
        ).toBeTruthy();
        expect(mocks.appAvatarWearSegments).toHaveBeenCalledWith(
            'usr_me',
            1000,
            9000
        );
        vi.restoreAllMocks();
    });
});
