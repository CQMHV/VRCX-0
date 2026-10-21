import { isRecord } from '@/shared/utils/record';

export type InstanceLanguageRow = {
    code: string;
    label: string;
    percent: number;
};

function stringList(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter(
              (item): item is string =>
                  typeof item === 'string' && Boolean(item.trim())
          )
        : [];
}

export function instanceLanguageRows(
    instance: unknown,
    nameForKey: (key: string) => string | undefined
): InstanceLanguageRow[] {
    const source = isRecord(instance) ? instance : {};
    const languages = stringList(source.languages);
    if (!languages.length) {
        return [];
    }
    const iso639 = stringList(source.languagesIso639);
    const ratio = isRecord(source.languageRatio) ? source.languageRatio : {};
    const baseOf = (code: string) => code.split('-')[0] ?? code;
    const bases = [...new Set(languages.map(baseOf))];
    const isoByBase = new Map(
        bases.map((base, index) => [base, iso639[index] ?? base])
    );
    return languages
        .map((code) => {
            const region = code.split('-')[1];
            const name =
                nameForKey(isoByBase.get(baseOf(code)) ?? code) ?? code;
            return {
                code,
                label: region ? `${name} (${region.toUpperCase()})` : name,
                percent: Math.round((Number(ratio[code]) || 0) * 100)
            };
        })
        .sort((left, right) => right.percent - left.percent);
}
