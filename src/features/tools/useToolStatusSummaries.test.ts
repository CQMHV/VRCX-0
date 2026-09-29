// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    commands,
    type AppLauncherEntry,
    type AppLauncherSnapshot
} from '@/platform/tauri/bindings';

const mocks = vi.hoisted(() => ({
    applyServerEntry: vi.fn(),
    getString: vi.fn(),
    snapshot: vi.fn(),
    setEntries: vi.fn(),
    setEnabled: vi.fn(),
    getProfileBackupSettings: vi.fn()
}));

vi.mock('@/platform/tauri/bindings', async () =>
    (await import('@/test/mockCommands')).mockBindingsModule()
);

vi.mock('@/repositories/configRepository', () => ({
    default: {
        applyServerEntry: mocks.applyServerEntry,
        getString: mocks.getString
    }
}));

vi.mock('@/repositories/appLauncherRepository', () => ({
    default: {
        snapshot: mocks.snapshot,
        setEntries: mocks.setEntries,
        setEnabled: mocks.setEnabled
    }
}));

vi.mock('@/services/profileBackupService', () => ({
    getProfileBackupSettings: mocks.getProfileBackupSettings,
    setProfileBackupSettings: vi.fn()
}));

import {
    countPresenceRules,
    useToolStatusSummaries
} from './useToolStatusSummaries';

function launcherEntry(id: string, enabled: boolean): AppLauncherEntry {
    return {
        id,
        enabled,
        name: id,
        kind: 'localApp',
        scope: 'all',
        target: `C:/${id}.exe`,
        args: '',
        launchDelaySeconds: 0,
        runPolicy: 'always',
        stopPolicy: 'keepRunning'
    };
}

function launcherSnapshot(entries: AppLauncherEntry[]): AppLauncherSnapshot {
    return { enabled: true, entries, activeSession: null, testRuns: [] };
}

beforeEach(() => {
    vi.mocked(commands.appPresenceAutomationRulesGet).mockImplementation(
        (kind) =>
            Promise.resolve(
                kind === 'time'
                    ? [
                          { id: 'morning', enabled: false },
                          { id: 'evening', enabled: false }
                      ]
                    : []
            )
    );
    vi.mocked(commands.appLlmEndpointList).mockResolvedValue([]);
    mocks.getString.mockResolvedValue('Off');
    mocks.getProfileBackupSettings.mockResolvedValue(null);
    mocks.snapshot.mockResolvedValue(
        launcherSnapshot([
            launcherEntry('obs', false),
            launcherEntry('discord', false)
        ])
    );
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('useToolStatusSummaries', () => {
    it('switches a single presence rule by id and caches the saved rules', async () => {
        const savedRules = [
            { id: 'morning', enabled: false },
            { id: 'evening', enabled: true },
            { id: 'night', enabled: true }
        ];
        vi.mocked(
            commands.appPresenceAutomationRuleEnabledSet
        ).mockResolvedValue(savedRules);
        const { result } = renderHook(() => useToolStatusSummaries());
        await waitFor(() =>
            expect(result.current.get('presence-schedule')?.items).toHaveLength(
                2
            )
        );
        const [, evening] = result.current.get('presence-schedule')!.items!;

        await evening.setEnabled(true);

        expect(
            commands.appPresenceAutomationRuleEnabledSet
        ).toHaveBeenCalledWith('time', 'evening', true);
        expect(commands.appPresenceAutomationRulesSet).not.toHaveBeenCalled();
        expect(mocks.applyServerEntry).toHaveBeenCalledWith(
            'presenceAutomationTimeRules',
            JSON.stringify(savedRules)
        );
    });

    it('switches a single app launcher entry by id', async () => {
        vi.mocked(commands.appAppLauncherEntryEnabledSet).mockResolvedValue(
            launcherSnapshot([
                launcherEntry('obs', false),
                launcherEntry('discord', true)
            ])
        );
        const { result } = renderHook(() => useToolStatusSummaries());
        await waitFor(() =>
            expect(result.current.get('app-launcher')?.items).toHaveLength(2)
        );
        const [, discord] = result.current.get('app-launcher')!.items!;

        await discord.setEnabled(true);

        expect(commands.appAppLauncherEntryEnabledSet).toHaveBeenCalledWith(
            'discord',
            true
        );
        expect(mocks.setEntries).not.toHaveBeenCalled();
    });
});

describe('countPresenceRules', () => {
    it('counts missing enabled flags as active and ignores invalid entries', () => {
        expect(
            countPresenceRules([
                { id: 'first', enabled: true },
                { id: 'second', enabled: false },
                { id: 'legacy' },
                null,
                'invalid'
            ])
        ).toEqual({ enabled: 2, total: 3 });
    });

    it('returns zero counts when status loading failed', () => {
        expect(countPresenceRules(null)).toEqual({ enabled: 0, total: 0 });
    });
});
