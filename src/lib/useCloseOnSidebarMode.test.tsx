// @vitest-environment jsdom

import {
    act,
    cleanup,
    fireEvent,
    render,
    screen
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useShellStore } from '@/state/shellStore';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogTrigger
} from '@/ui/shadcn/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger
} from '@/ui/shadcn/dialog';
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetTrigger
} from '@/ui/shadcn/sheet';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/services/shellIntegrationService', () => ({
    setTaskbarOverlayNotification: vi.fn(),
    setTrayIconNotification: vi.fn()
}));

const overlays = [
    {
        name: 'dialog',
        Root: Dialog,
        Content: DialogContent,
        Title: DialogTitle,
        Trigger: DialogTrigger
    },
    {
        name: 'sheet',
        Root: Sheet,
        Content: SheetContent,
        Title: SheetTitle,
        Trigger: SheetTrigger
    },
    {
        name: 'alert dialog',
        Root: AlertDialog,
        Content: AlertDialogContent,
        Title: AlertDialogTitle,
        Trigger: AlertDialogTrigger
    }
];

beforeEach(() => useShellStore.setState({ windowDisplayMode: 'normal' }));
afterEach(cleanup);

describe.each(overlays)(
    '$name entering sidebar mode',
    ({ Root, Content, Title, Trigger }) => {
        it.each([true, false])(
            'closes and stays closed with controlled=%s',
            async (controlled) => {
                const onClose = vi.fn();
                function Harness() {
                    const [open, setOpen] = useState(true);
                    return (
                        <Root
                            open={controlled ? open : undefined}
                            defaultOpen={!controlled}
                            onOpenChange={(nextOpen) => {
                                setOpen(nextOpen);
                                if (!nextOpen) onClose();
                            }}
                        >
                            <Trigger>Open popup</Trigger>
                            <Content>
                                <Title>Popup title</Title>
                            </Content>
                        </Root>
                    );
                }
                render(<Harness />);
                expect(screen.getByText('Popup title')).toBeTruthy();
                await act(async () =>
                    useShellStore
                        .getState()
                        .setWindowDisplayMode('sidebar', false)
                );
                expect(screen.queryByText('Popup title')).toBeNull();
                expect(onClose).toHaveBeenCalledTimes(1);
                await act(async () =>
                    useShellStore
                        .getState()
                        .setWindowDisplayMode('normal', false)
                );
                expect(screen.queryByText('Popup title')).toBeNull();
                fireEvent.click(screen.getByText('Open popup'));
                expect(screen.getByText('Popup title')).toBeTruthy();
                await act(async () =>
                    useShellStore
                        .getState()
                        .setWindowDisplayMode('sidebar', false)
                );
                expect(screen.queryByText('Popup title')).toBeNull();
                expect(onClose).toHaveBeenCalledTimes(2);
            }
        );
    }
);
