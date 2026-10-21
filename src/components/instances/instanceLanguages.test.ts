import { describe, expect, it } from 'vitest';

import { instanceLanguageRows } from './instanceLanguages';

describe('instanceLanguageRows', () => {
    it('names languages through their ISO 639 keys and orders them by share', () => {
        const names: Record<string, string> = {
            eng: 'English',
            zho: 'Chinese'
        };

        expect(
            instanceLanguageRows(
                {
                    languages: ['en', 'zh-cn', 'zh-tw'],
                    languagesIso639: ['eng', 'zho'],
                    languageRatio: { en: 0.25, 'zh-cn': 0.5, 'zh-tw': 0.25 }
                },
                (key) => names[key]
            )
        ).toEqual([
            { code: 'zh-cn', label: 'Chinese (CN)', percent: 50 },
            { code: 'en', label: 'English', percent: 25 },
            { code: 'zh-tw', label: 'Chinese (TW)', percent: 25 }
        ]);
    });

    it('returns nothing for instances without language data', () => {
        expect(instanceLanguageRows({}, () => undefined)).toEqual([]);
    });
});
