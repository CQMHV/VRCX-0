import { useEffect, useEffectEvent } from 'react';

export function useImagePasteShortcut({
    enabled,
    onPaste
}: {
    enabled: boolean;
    onPaste(): void | Promise<void>;
}) {
    const handlePasteShortcut = useEffectEvent((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            event.repeat ||
            event.isComposing ||
            event.altKey ||
            event.shiftKey ||
            !(event.ctrlKey || event.metaKey) ||
            event.key.toLowerCase() !== 'v'
        ) {
            return;
        }

        const editableSelector =
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
        const target = event.target instanceof Element ? event.target : null;
        if (
            target?.closest(editableSelector) ||
            document.activeElement?.closest(editableSelector)
        ) {
            return;
        }

        event.preventDefault();
        void onPaste();
    });

    useEffect(() => {
        if (!enabled) {
            return;
        }
        const listener = (event: KeyboardEvent) => handlePasteShortcut(event);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, [enabled]);
}
