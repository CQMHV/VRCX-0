import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useHighlightedCode } from '@/lib/use-highlighted-code';
import {
    CodeBlock,
    CodeBlockActions,
    CodeBlockContent,
    CodeBlockCopyButton,
    CodeBlockHeader,
    CodeBlockLine,
    CodeBlockTitle
} from '@/ui/shadcn/code-block';

export function HighlightedCodeBlock({
    code,
    language,
    title,
    size,
    className,
    contentClassName
}: {
    code: string;
    language: string;
    title?: ReactNode;
    size?: 'default' | 'sm';
    className?: string;
    contentClassName?: string;
}) {
    const { t } = useTranslation();
    const lines = useHighlightedCode(code, language);
    const actions = (
        <CodeBlockActions>
            <CodeBlockCopyButton
                value={code}
                aria-label={t('common.actions.copy')}
            />
        </CodeBlockActions>
    );

    return (
        <CodeBlock size={size} className={className}>
            {title ? (
                <CodeBlockHeader>
                    <CodeBlockTitle>{title}</CodeBlockTitle>
                    {actions}
                </CodeBlockHeader>
            ) : (
                actions
            )}
            <CodeBlockContent className={contentClassName}>
                {lines.map((line, index) => (
                    <CodeBlockLine key={index}>{line}</CodeBlockLine>
                ))}
            </CodeBlockContent>
        </CodeBlock>
    );
}
