import type { Dialog } from '@base-ui/react/dialog';
import { useEffect, useRef } from 'react';

import { useShellStore } from '@/state/shellStore';

export function useCloseOnSidebarMode({
    open,
    defaultOpen = false,
    actionsRef,
    onOpenChange
}: Dialog.Root.Props) {
    const localActionsRef = useRef<Dialog.Root.Actions | null>(null);
    const resolvedActionsRef = actionsRef ?? localActionsRef;
    const openRef = useRef(open ?? defaultOpen);
    if (open !== undefined) {
        openRef.current = open;
    }

    useEffect(
        () =>
            useShellStore.subscribe((state, previous) => {
                if (
                    state.windowDisplayMode === 'sidebar' &&
                    previous.windowDisplayMode !== 'sidebar' &&
                    openRef.current
                ) {
                    resolvedActionsRef.current?.close();
                }
            }),
        [resolvedActionsRef]
    );

    return {
        actionsRef: resolvedActionsRef,
        onOpenChange(
            nextOpen: boolean,
            details: Dialog.Root.ChangeEventDetails
        ) {
            onOpenChange?.(nextOpen, details);
            if (!details.isCanceled) {
                openRef.current = nextOpen;
            }
        }
    };
}
