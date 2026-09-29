// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAppTable } from '@/components/data-table/appTable';
import type { GroupProfileRecord } from '@/domain/entities/group';
import { commands } from '@/platform/tauri/bindings';
import groupProfileRepository from '@/repositories/groupProfileRepository';
import { useRuntimeStore } from '@/state/runtimeStore';

import { usePlayerListColumns } from './components/PlayerListColumns';
import { playerGroupRoles, playerGroupRoster } from './playerListGroupRoles';
import type { PlayerListRow } from './playerListTypes';
import { usePlayerListGroupRoles } from './usePlayerListGroupRoles';

vi.mock('@/platform/tauri/bindings', () => ({
    commands: { appVrchatGroupMemberRoleIdsGet: vi.fn() }
}));
vi.mock('@/repositories/groupProfileRepository', () => ({
    default: { getGroupProfile: vi.fn() }
}));
const roles = [
    { id: 'member', name: 'Member', order: 5 },
    { id: 'staff', name: 'Staff', order: 1 },
    { id: 'unknown', name: 'Unknown' }
];
const group = { ownerId: '', roles } as unknown as GroupProfileRecord;
const roster = playerGroupRoster(group);

function player(userId: string): PlayerListRow {
    return {
        userId,
        displayName: userId,
        userRef: null,
        trustLevel: '',
        trustSortNum: 0,
        trustClass: '',
        platformLabel: '',
        platformIcon: null,
        platformClassName: '',
        inVRMode: null,
        status: '',
        statusDescription: '',
        languages: [],
        bioLinks: [],
        note: '',
        avatarUrl: '',
        isCurrentUser: false,
        isFriend: false,
        isFavorite: false,
        isBlocked: false,
        isMuted: false,
        isAvatarInteractionDisabled: false,
        isChatBoxMuted: false,
        timeoutTime: 0,
        moderationSeverity: '',
        ageVerified: false,
        timerMs: 0,
        worldName: '',
        location: ''
    };
}

function renderRoles(initialRows: PlayerListRow[]) {
    useRuntimeStore.setState((state) => ({
        auth: { ...state.auth, currentUserId: 'owner', currentUserEndpoint: '' }
    }));
    vi.mocked(groupProfileRepository.getGroupProfile).mockResolvedValue(group);
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } }
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const rendered = renderHook(
        ({ rows }) =>
            usePlayerListGroupRoles('wrld_test:1~group(grp_a)', rows, true),
        {
            initialProps: { rows: initialRows },
            wrapper
        }
    );
    return { ...rendered, client };
}

function roleNames(rows: readonly PlayerListRow[]) {
    return rows.map((row) => row.groupRoles?.map((role) => role.name) ?? null);
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('player list group roles', () => {
    it('matches role IDs and uses the group order, telling regular members from unknown ones', () => {
        expect(
            playerGroupRoles(
                roster,
                ['member', 'staff', 'missing'],
                'user'
            )?.map((role) => role.name)
        ).toEqual(['Staff', 'Member']);
        expect(playerGroupRoles(roster, [], 'user')).toEqual([]);
        expect(playerGroupRoles(roster, undefined, 'user')).toBeNull();
        expect(playerGroupRoles(roster, null, 'user')).toBeNull();
    });

    it.each([false, true])(
        'sorts by the highest role and keeps empty values last (descending %s)',
        (desc) => {
            const rows = ['member', 'staff', 'regular', 'unknown'].map(
                (id) => ({
                    ...player(id),
                    groupRoles:
                        id === 'unknown'
                            ? null
                            : playerGroupRoles(
                                  roster,
                                  id === 'regular' ? [] : [id],
                                  id
                              )
                })
            );
            const { result } = renderHook(() =>
                useAppTable({
                    data: rows,
                    columns: usePlayerListColumns(),
                    state: { sorting: [{ id: 'groupRoles', desc }] },
                    getRowId: (row) => row.userId
                })
            );
            expect(
                result.current
                    .getRowModel()
                    .rows.map((row) => row.original.userId)
            ).toEqual(
                desc
                    ? ['regular', 'member', 'staff', 'unknown']
                    : ['staff', 'member', 'regular', 'unknown']
            );
        }
    );

    it('looks up newly seen players in one batch, caches role IDs per player and refetches on refresh', async () => {
        const roleIdsByUser: Record<string, string[] | null> = {
            a: ['staff'],
            b: null,
            c: ['member']
        };
        vi.mocked(commands.appVrchatGroupMemberRoleIdsGet).mockImplementation(
            async ({ userIds }) =>
                userIds.map((userId) => ({
                    userId,
                    roleIds: roleIdsByUser[userId] ?? null
                }))
        );
        const { result, rerender, client } = renderRoles([
            player('a'),
            player('b')
        ]);
        await waitFor(() =>
            expect(roleNames(result.current.rows)).toEqual([['Staff'], null])
        );
        expect(commands.appVrchatGroupMemberRoleIdsGet).toHaveBeenCalledTimes(
            1
        );
        expect(commands.appVrchatGroupMemberRoleIdsGet).toHaveBeenCalledWith({
            groupId: 'grp_a',
            userIds: ['a', 'b']
        });
        expect(
            client.getQueryData(['player-list-group', 'owner', '', 'grp_a'])
        ).toEqual(roster);
        expect(
            client.getQueryData([
                'player-list-group',
                'owner',
                '',
                'grp_a',
                'a'
            ])
        ).toEqual(['staff']);
        expect(
            client.getQueryData([
                'player-list-group',
                'owner',
                '',
                'grp_a',
                'b'
            ])
        ).toBeNull();

        rerender({ rows: [player('a'), player('b'), player('c')] });
        await waitFor(() =>
            expect(roleNames(result.current.rows)[2]).toEqual(['Member'])
        );
        expect(commands.appVrchatGroupMemberRoleIdsGet).toHaveBeenCalledTimes(
            2
        );
        expect(
            commands.appVrchatGroupMemberRoleIdsGet
        ).toHaveBeenLastCalledWith({
            groupId: 'grp_a',
            userIds: ['c']
        });

        rerender({ rows: [player('c')] });
        rerender({ rows: [player('a'), player('c')] });
        await waitFor(() =>
            expect(roleNames(result.current.rows)[0]).toEqual(['Staff'])
        );
        expect(commands.appVrchatGroupMemberRoleIdsGet).toHaveBeenCalledTimes(
            2
        );

        act(() => result.current.refresh());
        await waitFor(() =>
            expect(
                commands.appVrchatGroupMemberRoleIdsGet
            ).toHaveBeenCalledTimes(3)
        );
        expect(
            commands.appVrchatGroupMemberRoleIdsGet
        ).toHaveBeenLastCalledWith({
            groupId: 'grp_a',
            userIds: ['a', 'c']
        });

        act(() => result.current.selectGroup('grp_b'));
        expect(result.current.groupId).toBe('grp_b');
        expect(roleNames(result.current.rows)).toEqual([null, null]);
        await waitFor(() =>
            expect(
                commands.appVrchatGroupMemberRoleIdsGet
            ).toHaveBeenLastCalledWith({
                groupId: 'grp_b',
                userIds: ['a', 'c']
            })
        );
        client.clear();
    });

    it('sends larger rooms in chunks of six, one chunk at a time', async () => {
        const pending: Array<
            (value: { userId: string; roleIds: string[] }[]) => void
        > = [];
        vi.mocked(commands.appVrchatGroupMemberRoleIdsGet).mockImplementation(
            () =>
                new Promise((resolve) => {
                    pending.push(resolve);
                })
        );
        const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const { result, client } = renderRoles(ids.map(player));

        await waitFor(() =>
            expect(
                commands.appVrchatGroupMemberRoleIdsGet
            ).toHaveBeenCalledTimes(1)
        );
        expect(
            commands.appVrchatGroupMemberRoleIdsGet
        ).toHaveBeenLastCalledWith({
            groupId: 'grp_a',
            userIds: ids.slice(0, 6)
        });

        await act(async () => {
            pending[0](
                ids
                    .slice(0, 6)
                    .map((userId) => ({ userId, roleIds: ['staff'] }))
            );
        });
        await waitFor(() =>
            expect(roleNames(result.current.rows)[0]).toEqual(['Staff'])
        );
        await waitFor(() =>
            expect(
                commands.appVrchatGroupMemberRoleIdsGet
            ).toHaveBeenCalledTimes(2)
        );
        expect(
            commands.appVrchatGroupMemberRoleIdsGet
        ).toHaveBeenLastCalledWith({
            groupId: 'grp_a',
            userIds: ['g', 'h']
        });
        await act(async () => {
            pending[1](
                ['g', 'h'].map((userId) => ({ userId, roleIds: ['member'] }))
            );
        });
        await waitFor(() =>
            expect(roleNames(result.current.rows)[7]).toEqual(['Member'])
        );
        client.clear();
    });
});
