// @vitest-environment jsdom

import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useImagePasteShortcut } from './useImagePasteShortcut';

function pasteEvent(options: KeyboardEventInit = {}) {
    return new KeyboardEvent('keydown', {
        key: 'v',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        ...options
    });
}

describe('image paste shortcut', () => {
    afterEach(cleanup);

    it.each([{ ctrlKey: true }, { ctrlKey: false, metaKey: true }])(
        'requests image paste with the primary modifier: %o',
        (options) => {
            const onPaste = vi.fn();
            renderHook(() => useImagePasteShortcut({ enabled: true, onPaste }));
            const event = pasteEvent(options);
            fireEvent(window, event);
            expect(onPaste).toHaveBeenCalledOnce();
            expect(event.defaultPrevented).toBe(true);
        }
    );

    it('uses the current upload callback and stops after disable or unmount', () => {
        const firstPaste = vi.fn();
        const nextPaste = vi.fn();
        const { rerender, unmount } = renderHook(
            (props) => useImagePasteShortcut(props),
            { initialProps: { enabled: true, onPaste: firstPaste } }
        );
        fireEvent(window, pasteEvent());
        rerender({ enabled: true, onPaste: nextPaste });
        fireEvent(window, pasteEvent());
        expect(firstPaste).toHaveBeenCalledOnce();
        expect(nextPaste).toHaveBeenCalledOnce();

        rerender({ enabled: false, onPaste: nextPaste });
        const disabledEvent = pasteEvent();
        fireEvent(window, disabledEvent);
        expect(disabledEvent.defaultPrevented).toBe(false);
        rerender({ enabled: true, onPaste: nextPaste });
        unmount();
        const unmountedEvent = pasteEvent();
        fireEvent(window, unmountedEvent);
        expect(unmountedEvent.defaultPrevented).toBe(false);
        expect(nextPaste).toHaveBeenCalledOnce();
    });

    it.each(['input', 'textarea', 'select', 'contenteditable', 'textbox'])(
        'preserves normal paste with focus inside %s',
        (kind) => {
            const onPaste = vi.fn();
            renderHook(() => useImagePasteShortcut({ enabled: true, onPaste }));
            const control = document.createElement(
                kind === 'contenteditable' || kind === 'textbox' ? 'div' : kind
            );
            if (kind === 'contenteditable') {
                control.setAttribute('contenteditable', 'true');
            } else if (kind === 'textbox') {
                control.setAttribute('role', 'textbox');
            }
            control.tabIndex = 0;
            const { container } = render(<div />);
            container.append(control);
            control.focus();
            for (const target of [control, window]) {
                const event = pasteEvent();
                fireEvent(target, event);
                expect(event.defaultPrevented).toBe(false);
            }
            expect(onPaste).not.toHaveBeenCalled();
        }
    );

    it('preserves paste from a nested editable target without focus', () => {
        const onPaste = vi.fn();
        renderHook(() => useImagePasteShortcut({ enabled: true, onPaste }));
        const { getByText } = render(
            <div contentEditable suppressContentEditableWarning>
                <span>editable text</span>
            </div>
        );
        const event = pasteEvent();
        fireEvent(getByText('editable text'), event);
        expect(event.defaultPrevented).toBe(false);
        expect(onPaste).not.toHaveBeenCalled();
    });

    it.each([
        { ctrlKey: false },
        { key: 'c' },
        { shiftKey: true },
        { altKey: true },
        { repeat: true },
        { isComposing: true }
    ])('leaves other keyboard actions alone: %o', (options) => {
        const onPaste = vi.fn();
        renderHook(() => useImagePasteShortcut({ enabled: true, onPaste }));
        const event = pasteEvent(options);
        fireEvent(window, event);
        expect(event.defaultPrevented).toBe(false);
        expect(onPaste).not.toHaveBeenCalled();
    });

    it('respects paste shortcuts already handled by another control', () => {
        const onPaste = vi.fn();
        renderHook(() => useImagePasteShortcut({ enabled: true, onPaste }));
        const event = pasteEvent();
        event.preventDefault();
        fireEvent(window, event);
        expect(onPaste).not.toHaveBeenCalled();
    });
});
