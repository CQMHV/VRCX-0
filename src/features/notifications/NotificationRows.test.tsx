// @vitest-environment jsdom

import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationRow as NotificationRecord } from '@/repositories/notificationPersistenceRepository';
import { openGroupDialog, openUserDialog } from '@/services/dialogService';
import { translateTextDetailed } from '@/services/translationService';
import { HoverCard } from '@/ui/shadcn/hover-card';

import {
    NotificationRow,
    type NotificationFeedHandlers
} from './components/NotificationRow';
import { NotificationDrawerRow } from './drawer/NotificationDrawerRow';
import { NotificationHoverContent } from './drawer/NotificationDrawerRowParts';
import type { NotificationViewModelEmoji } from './notificationViewModel';

vi.mock('./useNotificationActorImage', () => ({
    useNotificationActorImage: () => ''
}));

vi.mock('./useNotificationEmojiImage', () => ({
    useNotificationEmojiImage: (emoji: NotificationViewModelEmoji) =>
        emoji.imageUrl
}));

vi.mock('@/services/dialogService', () => ({
    openUserDialog: vi.fn(),
    openGroupDialog: vi.fn()
}));

vi.mock('@/services/translationService', () => ({
    getTranslationConfig: vi.fn().mockResolvedValue({ bioLanguage: 'zh-CN' }),
    translateTextDetailed: vi.fn()
}));

beforeEach(() => {
    vi.mocked(translateTextDetailed).mockReset();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function friendRequest(): NotificationRecord {
    return {
        id: 'notif_friend_request',
        type: 'friendRequest',
        version: 1,
        senderUserId: 'usr_sender',
        senderUsername: 'Sender',
        seen: false,
        created_at: '2026-08-05T00:00:00.000Z',
        responses: []
    };
}

function actionHandlers() {
    return {
        onAcceptFriendRequest: vi.fn(),
        onAcceptRequestInvite: vi.fn(),
        onHideNotification: vi.fn(),
        onIgnoreNotificationLocally: vi.fn(),
        onMarkSeen: vi.fn(),
        onSendInviteResponseWithMessage: vi.fn(),
        onSendNotificationResponse: vi.fn()
    };
}

function renderTextNotification(
    surface: 'page' | 'drawer',
    notification: NotificationRecord
) {
    const handlers = {
        ...actionHandlers(),
        onDeleteNotification: vi.fn(),
        onOpenImagePreview: vi.fn(),
        onOpenLink: vi.fn(),
        onJoinQueueReady: vi.fn()
    };
    return render(
        surface === 'page' ? (
            <NotificationRow
                notification={notification}
                canInviteFromCurrentLocation={false}
                handlers={handlers}
            />
        ) : (
            <NotificationDrawerRow
                notification={notification}
                isUnseen
                canInviteFromCurrentLocation={false}
                handlers={handlers}
            />
        )
    );
}

describe.each(['page', 'drawer'] as const)(
    'notification translation in the %s',
    (surface) => {
        it.each([
            'group.announcement',
            'group.event.created',
            'group.event.starting'
        ])(
            'translates the %s headline and body and reuses the result when toggling',
            async (type) => {
                vi.mocked(translateTextDetailed).mockImplementation(
                    async (source) => ({
                        text:
                            source === 'Weekly meetup'
                                ? '每周聚会'
                                : '周五见！',
                        detectedSourceLang: 'en'
                    })
                );
                renderTextNotification(surface, {
                    id: 'not_translate',
                    type,
                    message: 'See you on Friday!',
                    data: {
                        groupName: 'Maple Club',
                        announcementTitle: 'Weekly meetup'
                    }
                });

                expect(translateTextDetailed).not.toHaveBeenCalled();
                fireEvent.click(
                    screen.getByRole('button', {
                        name: 'translation.translate'
                    })
                );
                await screen.findByRole('button', {
                    name: 'translation.show_original'
                });
                expect(translateTextDetailed).toHaveBeenCalledTimes(2);
                expect(translateTextDetailed).toHaveBeenCalledWith(
                    'Weekly meetup',
                    'zh-CN'
                );
                expect(translateTextDetailed).toHaveBeenCalledWith(
                    'See you on Friday!',
                    'zh-CN'
                );
                const translatedTitle = screen.getByText('每周聚会');
                const translated = screen.getByText('周五见！');
                expect(translatedTitle).not.toBe(translated);
                expect(translatedTitle.className).toContain('text-sm');
                expect(translatedTitle.className).toContain('font-medium');
                expect(translatedTitle.className).not.toContain('line-clamp');
                expect(translated.className).toContain('text-xs');
                expect(translated.className).toContain('whitespace-pre-wrap');
                expect(translated.className).not.toContain('line-clamp');
                expect(screen.queryByText('Weekly meetup')).toBeNull();
                expect(screen.getByText('Maple Club')).toBeTruthy();

                fireEvent.click(
                    screen.getByRole('button', {
                        name: 'translation.show_original'
                    })
                );
                expect(screen.getByText('Weekly meetup')).toBeTruthy();
                expect(screen.getByText('See you on Friday!')).toBeTruthy();
                fireEvent.click(
                    screen.getByRole('button', {
                        name: 'translation.translate'
                    })
                );
                await screen.findByRole('button', {
                    name: 'translation.show_original'
                });
                expect(translateTextDetailed).toHaveBeenCalledTimes(2);
            }
        );

        it('keeps the original visible after a failed translation and allows retry', async () => {
            vi.mocked(translateTextDetailed).mockRejectedValueOnce(
                new Error('Failed to fetch')
            );
            renderTextNotification(surface, {
                id: 'not_error',
                type: 'message',
                message: 'Hello there'
            });
            fireEvent.click(
                screen.getByRole('button', { name: 'translation.translate' })
            );
            await screen.findByText('translation.error_network');
            expect(screen.getByText('Hello there')).toBeTruthy();
            vi.mocked(translateTextDetailed).mockResolvedValueOnce({
                text: '你好',
                detectedSourceLang: 'en'
            });
            fireEvent.click(
                screen.getByRole('button', { name: 'translation.translate' })
            );
            await screen.findByText('你好');
            expect(screen.queryByText('translation.error_network')).toBeNull();
        });

        it('keeps both original sections if one translation fails and only retries the failed section', async () => {
            vi.mocked(translateTextDetailed)
                .mockResolvedValueOnce({
                    text: '每周聚会',
                    detectedSourceLang: 'en'
                })
                .mockRejectedValueOnce(new Error('Failed to fetch'));
            renderTextNotification(surface, {
                id: 'not_partial_translation',
                type: 'group.announcement',
                message: 'See you on Friday!',
                data: { announcementTitle: 'Weekly meetup' }
            });
            fireEvent.click(
                screen.getByRole('button', { name: 'translation.translate' })
            );
            await screen.findByText('translation.error_network');
            expect(screen.getByText('Weekly meetup')).toBeTruthy();
            expect(screen.getByText('See you on Friday!')).toBeTruthy();
            expect(screen.queryByText('每周聚会')).toBeNull();
            vi.mocked(translateTextDetailed).mockResolvedValueOnce({
                text: '周五见！',
                detectedSourceLang: 'en'
            });
            fireEvent.click(
                screen.getByRole('button', { name: 'translation.translate' })
            );
            await screen.findByText('周五见！');
            expect(screen.getByText('每周聚会').className).toContain(
                'font-medium'
            );
            expect(translateTextDetailed).toHaveBeenCalledTimes(3);
            expect(translateTextDetailed).toHaveBeenLastCalledWith(
                'See you on Friday!',
                'zh-CN'
            );
        });

        it('preserves line breaks and paragraphs within the translated body', async () => {
            const source =
                'See you on Friday!\n\nEveryone is welcome.\nPlease arrive on time.';
            const translated = '周五见！\n\n欢迎大家。\n请准时参加。';
            vi.mocked(translateTextDetailed).mockResolvedValueOnce({
                text: translated,
                detectedSourceLang: 'en'
            });
            renderTextNotification(surface, {
                id: 'not_paragraphs',
                type: 'message',
                message: source
            });
            fireEvent.click(
                screen.getByRole('button', { name: 'translation.translate' })
            );
            const body = await screen.findByText(
                '周五见！ 欢迎大家。 请准时参加。'
            );
            expect(body.textContent).toBe(translated);
            expect(body.className).toContain('whitespace-pre-wrap');
            expect(translateTextDetailed).toHaveBeenCalledExactlyOnceWith(
                source,
                'zh-CN'
            );
        });

        it('keeps the emoji preview when translating a boop message', async () => {
            vi.mocked(translateTextDetailed).mockResolvedValueOnce({
                text: '你好',
                detectedSourceLang: 'en'
            });
            renderTextNotification(surface, {
                id: 'not_boop',
                type: 'boop',
                message: 'Hello there',
                details: {
                    emojiId: 'file_emoji',
                    imageUrl: 'https://example.com/emoji.png'
                }
            });
            expect(screen.getByAltText('file_emoji')).toBeTruthy();
            fireEvent.click(
                screen.getByRole('button', { name: 'translation.translate' })
            );
            await screen.findByText('你好');
            expect(screen.getByAltText('file_emoji')).toBeTruthy();
        });

        it.each(['', '🎉🎉'])(
            'hides translation for empty or symbol-only messages: %s',
            async (message) => {
                renderTextNotification(surface, {
                    id: 'not_empty',
                    type: 'message',
                    message
                });
                await waitFor(() =>
                    expect(
                        screen.queryByRole('button', {
                            name: 'translation.translate'
                        })
                    ).toBeNull()
                );
                expect(translateTextDetailed).not.toHaveBeenCalled();
            }
        );

        it('translates a title-only announcement once when the body repeats the title', async () => {
            vi.mocked(translateTextDetailed).mockResolvedValueOnce({
                text: '每周聚会',
                detectedSourceLang: 'en'
            });
            renderTextNotification(surface, {
                id: 'not_title',
                type: 'group.announcement',
                message: 'Weekly meetup',
                data: { announcementTitle: 'Weekly meetup' }
            });
            fireEvent.click(
                screen.getByRole('button', { name: 'translation.translate' })
            );
            await screen.findByText('每周聚会');
            expect(translateTextDetailed).toHaveBeenCalledExactlyOnceWith(
                'Weekly meetup',
                'zh-CN'
            );
        });
    }
);

it('preserves the translated announcement headline in the hover details', async () => {
    vi.mocked(translateTextDetailed).mockImplementation(async (source) => ({
        text: source === 'Weekly meetup' ? '每周聚会' : '周五见！',
        detectedSourceLang: 'en'
    }));
    render(
        <HoverCard open>
            <NotificationHoverContent
                notification={{
                    id: 'not_hover',
                    type: 'group.announcement',
                    message: 'See you on Friday!',
                    data: { announcementTitle: 'Weekly meetup' }
                }}
                senderName="Maple Club"
                typeLabel="Announcement"
                message="See you on Friday!"
                absoluteTime=""
                actorImageUrl=""
            />
        </HoverCard>
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'translation.translate' })
    );
    const headline = await screen.findByText('每周聚会');
    expect(headline.className).toContain('text-sm');
    expect(headline.className).toContain('font-medium');
    expect(screen.getByText('周五见！').className).toContain('text-xs');
    expect(translateTextDetailed).toHaveBeenCalledTimes(2);
    expect(translateTextDetailed).toHaveBeenCalledWith(
        'Weekly meetup',
        'zh-CN'
    );
    expect(translateTextDetailed).toHaveBeenCalledWith(
        'See you on Friday!',
        'zh-CN'
    );
});

describe('group invite notification rows', () => {
    it.each(['page', 'drawer'] as const)(
        'opens the inviter profile separately from the group in the %s',
        (surface) => {
            const userId = 'usr_00000000-0000-0000-0000-000000000001';
            const notification: NotificationRecord = {
                id: 'not_group_invite',
                type: 'group.invite',
                version: 2,
                senderUserId: userId,
                message: 'Maple has invited you to Maple Club!',
                title: 'Group invitation',
                link: 'group:grp_club',
                data: {
                    managerUserDisplayName: 'Maple',
                    groupName: 'Maple Club',
                    groupId: 'grp_club'
                }
            };
            const handlers = {
                ...actionHandlers(),
                onDeleteNotification: vi.fn(),
                onOpenImagePreview: vi.fn(),
                onOpenLink: vi.fn(),
                onJoinQueueReady: vi.fn()
            };
            render(
                surface === 'page' ? (
                    <NotificationRow
                        notification={notification}
                        canInviteFromCurrentLocation={false}
                        handlers={handlers}
                    />
                ) : (
                    <NotificationDrawerRow
                        notification={notification}
                        isUnseen
                        canInviteFromCurrentLocation={false}
                        handlers={handlers}
                    />
                )
            );

            fireEvent.click(screen.getByRole('button', { name: 'Maple' }));
            expect(openUserDialog).toHaveBeenCalledExactlyOnceWith({
                userId,
                title: 'Maple'
            });
            expect(openGroupDialog).not.toHaveBeenCalled();

            fireEvent.click(
                screen.getByText(
                    surface === 'page' ? 'Maple Club' : 'Group invitation'
                )
            );
            expect(openGroupDialog).toHaveBeenCalledWith({
                groupId: 'grp_club',
                title: 'Group invitation'
            });
        }
    );
});

describe('friend request notification rows', () => {
    it('renders mark seen as the third action in the notification page row', () => {
        const handlers: NotificationFeedHandlers = {
            ...actionHandlers(),
            onDeleteNotification: vi.fn(),
            onOpenImagePreview: vi.fn(),
            onOpenLink: vi.fn()
        };

        render(
            <NotificationRow
                notification={friendRequest()}
                currentUserId="usr_self"
                canInviteFromCurrentLocation={false}
                handlers={handlers}
            />
        );

        const actionButtons = screen
            .getAllByRole('button')
            .filter((button) =>
                [
                    'view.notification.actions.accept',
                    'view.notification.actions.decline',
                    'view.notification.action.mark_seen'
                ].includes(button.textContent || '')
            );
        expect(actionButtons.map((button) => button.textContent)).toEqual([
            'view.notification.actions.accept',
            'view.notification.actions.decline',
            'view.notification.action.mark_seen'
        ]);

        fireEvent.click(actionButtons[2]);
        expect(handlers.onMarkSeen).toHaveBeenCalledTimes(1);
    });
});
