import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
    readTextFile: vi.fn(),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
    ...fs,
    BaseDirectory: { AppCache: 16 }
}));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

describe('navigation cache', () => {
    it('restores the route and independent open and closed folders', async () => {
        fs.readTextFile.mockResolvedValue(
            JSON.stringify({
                lastRoute: '/settings?tab=appearance',
                folders: { favorites: false, tools: true, invalid: 'true' }
            })
        );
        const { useNavigationCacheStore } =
            await import('./navigationCacheStore');
        await useNavigationCacheStore.getState().hydrate();
        expect(useNavigationCacheStore.getState()).toMatchObject({
            hydrated: true,
            lastRoute: '/settings?tab=appearance',
            folders: { favorites: false, tools: true }
        });
        expect(fs.writeTextFile).not.toHaveBeenCalled();
    });

    it('does not overwrite stored navigation before hydration completes', async () => {
        let finishRead: (value: string) => void = () => {};
        fs.readTextFile.mockReturnValue(
            new Promise<string>((resolve) => {
                finishRead = resolve;
            })
        );
        const { useNavigationCacheStore } =
            await import('./navigationCacheStore');
        const loading = useNavigationCacheStore.getState().hydrate();
        useNavigationCacheStore.getState().setLastRoute('/feed');
        useNavigationCacheStore.getState().setFolderOpen('tools', false);
        finishRead(
            JSON.stringify({ lastRoute: '/game-log', folders: { tools: true } })
        );
        await loading;
        expect(useNavigationCacheStore.getState().lastRoute).toBe('/game-log');
        expect(useNavigationCacheStore.getState().folders.tools).toBe(true);
        expect(fs.writeTextFile).not.toHaveBeenCalled();
    });

    it('continues with defaults on damaged cache and saves subsequent changes together', async () => {
        fs.readTextFile.mockResolvedValue('{');
        const { useNavigationCacheStore } =
            await import('./navigationCacheStore');
        await useNavigationCacheStore.getState().hydrate();
        expect(useNavigationCacheStore.getState().hydrated).toBe(true);
        useNavigationCacheStore.getState().setFolderOpen('favorites', false);
        useNavigationCacheStore.getState().setLastRoute('/friends-locations');
        await vi.waitFor(() =>
            expect(fs.writeTextFile).toHaveBeenCalledTimes(2)
        );
        expect(JSON.parse(fs.writeTextFile.mock.calls[1][1])).toEqual({
            lastRoute: '/friends-locations',
            folders: { favorites: false }
        });
    });
});
