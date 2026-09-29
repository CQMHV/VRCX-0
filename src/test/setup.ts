import { vi } from 'vitest';

vi.mock('react-i18next', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-i18next')>();
    const t = (key: string) => key;
    const i18n = { language: 'en', changeLanguage: () => Promise.resolve() };
    return {
        ...actual,
        useTranslation: () => ({ t, i18n, ready: true })
    };
});
