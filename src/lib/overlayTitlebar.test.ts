// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
    markAppTitleBarWindowAction,
    preserveAppTitleBarOnOpenChange
} from './overlayTitlebar';

describe('preserveAppTitleBarOnOpenChange', () => {
    it('keeps an overlay open when window restoration changes the event target', () => {
        const cancel = vi.fn();

        markAppTitleBarWindowAction();

        expect(
            preserveAppTitleBarOnOpenChange(false, {
                reason: 'outside-press',
                event: new Event('click'),
                cancel
            })
        ).toBe(true);
        expect(cancel).toHaveBeenCalledOnce();
    });
});
