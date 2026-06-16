import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

// This config enforces formatting only. Type-aware / code-quality rules are
// intentionally out of scope — keep it to @stylistic.

/**
 * SPFN house style — enforced via @stylistic (formatting only, no type-aware rules).
 *
 * This config is the source of truth for code style. Do not run Prettier:
 * it cannot express Allman braces and would rewrite the codebase incorrectly.
 *
 *   pnpm lint        # report
 *   pnpm lint:fix    # auto-fix
 */
export default [
    {
        ignores: [
            'apps/**',                   // local-only scratch apps (gitignored)
            '**/dist/**',
            '**/.next/**',
            '**/node_modules/**',
            '**/.turbo/**',
            '**/coverage/**',
            '**/generated/**',          // codegen output
            '**/components/ui/**',       // vendored shadcn/ui primitives
            '**/*.d.ts',
        ],
    },
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
            },
        },
        plugins: { '@stylistic': stylistic, '@typescript-eslint': tseslint.plugin },
        rules: {
            // Out of scope for a formatting baseline — keep off.
            '@typescript-eslint/no-explicit-any': 'off',

            // House style
            '@stylistic/brace-style': ['error', 'allman', { allowSingleLine: false }],
            '@stylistic/indent': ['error', 4, { SwitchCase: 1 }],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
            '@stylistic/comma-dangle': ['error', 'always-multiline'],
            '@stylistic/eol-last': ['error', 'always'],

            // Readability — spacing for humans
            '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
            '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
            '@stylistic/padding-line-between-statements': [
                'error',
                { blankLine: 'always', prev: '*', next: 'return' },
                { blankLine: 'always', prev: 'directive', next: '*' },
                { blankLine: 'always', prev: ['interface', 'type'], next: '*' },
                { blankLine: 'always', prev: '*', next: ['interface', 'type'] },
            ],
        },
    },
];
