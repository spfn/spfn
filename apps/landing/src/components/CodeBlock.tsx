'use client';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps
{
    code: string;
    language?: string;
    className?: string;
    showLineNumbers?: boolean;
    variant?: 'default' | 'card';
}

export default function CodeBlock({ code, language = 'typescript', className = '', showLineNumbers = false, variant = 'default' }: CodeBlockProps)
{
    const wrapperClasses = variant === 'card'
        ? `rounded-xl bg-gray-900 dark:bg-black/40 ring-1 ring-gray-800 dark:ring-white/10 backdrop-blur-sm overflow-hidden ${className}`
        : `rounded-lg overflow-hidden ${className}`;

    return (
        <div className={wrapperClasses}>
            <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                showLineNumbers={showLineNumbers}
                customStyle={{
                    margin: 0,
                    padding: '1rem',
                    background: variant === 'card' ? 'transparent' : 'rgb(17 24 39)',
                    fontSize: '0.875rem',
                }}
                codeTagProps={{
                    style: {
                        fontFamily: 'var(--font-jetbrains-mono), monospace',
                    }
                }}
            >
                { code }
            </SyntaxHighlighter>
        </div>
    );
}