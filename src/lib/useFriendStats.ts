import { useEffect } from 'react';

import type { FriendStatsById } from '@/domain/friends/friendStats';
import { loadFriendStats } from '@/services/friendStatsService';
import { useFriendRosterStore } from '@/state/friendRosterStore';
import { useFriendStatsStore } from '@/state/friendStatsStore';
import { useRuntimeStore } from '@/state/runtimeStore';

const STATS_HYDRATION_DEBOUNCE_MS = 400;
const NO_FRIEND_STATS: FriendStatsById = {};

export function useFriendStatsHydration(enabled: boolean) {
    const ownerUserId = useRuntimeStore((state) => state.auth.currentUserId);
    const friendsKey = useFriendRosterStore((state) =>
        enabled
            ? state.orderedFriendIds
                  .map(
                      (id) =>
                          `${id}:${state.friendsById[id]?.displayName ?? ''}`
                  )
                  .join('\u0001')
            : ''
    );

    useEffect(() => {
        if (!enabled || !ownerUserId || !friendsKey) {
            return undefined;
        }
        let active = true;
        const timer = setTimeout(() => {
            const { orderedFriendIds, friendsById } =
                useFriendRosterStore.getState();
            const friends = orderedFriendIds.map((id) => ({
                id,
                displayName: friendsById[id]?.displayName ?? ''
            }));
            loadFriendStats(ownerUserId, friends)
                .then((byUserId) => {
                    if (active) {
                        useFriendStatsStore
                            .getState()
                            .replaceStats(ownerUserId, byUserId);
                    }
                })
                .catch((error: unknown) => {
                    console.warn('[FriendStats] Failed to load', error);
                });
        }, STATS_HYDRATION_DEBOUNCE_MS);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [enabled, friendsKey, ownerUserId]);
}

export function useFriendStatsById(): FriendStatsById {
    const currentUserId = useRuntimeStore((state) => state.auth.currentUserId);
    return useFriendStatsStore((state) =>
        state.ownerUserId === currentUserId ? state.byUserId : NO_FRIEND_STATS
    );
}
