import { describe, expect, it } from 'vitest';

import { avatarFeedEntry } from '@/components/feed/feedLiveTestEntries';

import { mergeFeedRowsWithSnapshot } from './feedLiveMergeService';

describe('mergeFeedRowsWithSnapshot', () => {
    it('projects live avatar entries into feed rows', () => {
        const result = mergeFeedRowsWithSnapshot({
            buildMergeOptions: ({ rows }) => ({
                rows,
                userId: 'usr_self',
                maxRows: 10
            }),
            liveEntries: [
                {
                    sequence: 1,
                    entry: avatarFeedEntry({
                        ownerId: 'usr_author_new',
                        previousOwnerId: 'usr_author_old',
                        avatarName: 'New Avatar',
                        previousAvatarName: 'Old Avatar',
                        currentAvatarImageUrl:
                            'https://api.vrchat.cloud/api/1/image/file_new/1/256',
                        previousCurrentAvatarImageUrl:
                            'https://api.vrchat.cloud/api/1/image/file_old/1/256'
                    })
                }
            ],
            livePatches: [],
            minLiveSequence: 0,
            rows: []
        });

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({
            type: 'Avatar',
            userId: 'usr_friend',
            displayName: 'Friend',
            ownerId: 'usr_author_new',
            previousOwnerId: 'usr_author_old',
            avatarName: 'New Avatar',
            previousAvatarName: 'Old Avatar',
            currentAvatarImageUrl:
                'https://api.vrchat.cloud/api/1/image/file_new/1/256',
            previousCurrentAvatarImageUrl:
                'https://api.vrchat.cloud/api/1/image/file_old/1/256'
        });
    });
});
