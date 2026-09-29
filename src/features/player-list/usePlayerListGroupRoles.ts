import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { commands } from '@/platform/tauri/bindings';
import groupProfileRepository from '@/repositories/groupProfileRepository';
import { parseLocation } from '@/shared/utils/location';
import { useRuntimeStore } from '@/state/runtimeStore';

import { playerGroupRoles, playerGroupRoster } from './playerListGroupRoles';
import type { PlayerListRow } from './playerListTypes';

const ROLE_LOOKUP_CHUNK_SIZE = 6;

type PendingRoleLookup = {
    groupId: string;
    userId: string;
    signal: AbortSignal;
    resolve: (roleIds: string[] | null) => void;
};

const pendingRoleLookups: PendingRoleLookup[] = [];
let drainingRoleLookups = false;

function takeRoleLookupChunk(): PendingRoleLookup[] {
    const chunk: PendingRoleLookup[] = [];
    let index = 0;
    while (
        index < pendingRoleLookups.length &&
        chunk.length < ROLE_LOOKUP_CHUNK_SIZE
    ) {
        const lookup = pendingRoleLookups[index];
        if (lookup.signal.aborted) {
            pendingRoleLookups.splice(index, 1);
            lookup.resolve(null);
        } else if (!chunk.length || lookup.groupId === chunk[0].groupId) {
            pendingRoleLookups.splice(index, 1);
            chunk.push(lookup);
        } else {
            index += 1;
        }
    }
    return chunk;
}

async function drainRoleLookups() {
    for (
        let chunk = takeRoleLookupChunk();
        chunk.length;
        chunk = takeRoleLookupChunk()
    ) {
        const results = await commands
            .appVrchatGroupMemberRoleIdsGet({
                groupId: chunk[0].groupId,
                userIds: [...new Set(chunk.map((lookup) => lookup.userId))]
            })
            .catch(() => []);
        const roleIdsByUser = new Map(
            results.map((result) => [result.userId, result.roleIds])
        );
        for (const lookup of chunk) {
            lookup.resolve(roleIdsByUser.get(lookup.userId) ?? null);
        }
    }
    drainingRoleLookups = false;
}

function lookupMemberRoleIds(
    groupId: string,
    userId: string,
    signal: AbortSignal
): Promise<string[] | null> {
    return new Promise((resolve) => {
        pendingRoleLookups.push({ groupId, userId, signal, resolve });
        if (!drainingRoleLookups) {
            drainingRoleLookups = true;
            setTimeout(() => void drainRoleLookups(), 0);
        }
    });
}

export function usePlayerListGroupRoles(
    location: string,
    rows: readonly PlayerListRow[],
    enabled: boolean
) {
    const queryClient = useQueryClient();
    const ownerId = useRuntimeStore((state) => state.auth.currentUserId);
    const endpoint = useRuntimeStore((state) => state.auth.currentUserEndpoint);
    const context = JSON.stringify([ownerId, endpoint, location]);
    const [selection, setSelection] = useState({ context, value: 'auto' });
    const selectedGroup =
        selection.context === context ? selection.value : 'auto';
    const instanceGroupId = parseLocation(location).groupId || '';
    const groupId = selectedGroup === 'auto' ? instanceGroupId : selectedGroup;
    const active = Boolean(enabled && ownerId && groupId);
    const rosterKey = ['player-list-group', ownerId, endpoint, groupId];
    const roster = useQuery({
        queryKey: rosterKey,
        enabled: active,
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        queryFn: async () =>
            playerGroupRoster(
                await groupProfileRepository.getGroupProfile({
                    groupId,
                    includeRoles: true
                })
            )
    });
    const userIds = useMemo(
        () => [...new Set(rows.map((row) => row.userId).filter(Boolean))],
        [rows]
    );
    const looked = useQueries({
        queries: userIds.map((userId) => ({
            queryKey: [...rosterKey, userId],
            enabled: active,
            retry: false,
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            queryFn: ({ signal }) =>
                lookupMemberRoleIds(groupId, userId, signal)
        })),
        combine: (results) => results.map((result) => result.data)
    });
    const members = useMemo(
        () => new Map(userIds.map((userId, index) => [userId, looked[index]])),
        [looked, userIds]
    );
    const enrichedRows = useMemo(
        () =>
            rows.map((row) => ({
                ...row,
                groupRoles: roster.data
                    ? playerGroupRoles(
                          roster.data,
                          members.get(row.userId),
                          row.userId
                      )
                    : null
            })),
        [members, roster.data, rows]
    );

    return {
        rows: enrichedRows,
        selectedGroup,
        groupId,
        instanceGroupId,
        selectGroup: (value: string) => setSelection({ context, value }),
        refresh: () =>
            void queryClient.invalidateQueries({ queryKey: rosterKey })
    };
}
