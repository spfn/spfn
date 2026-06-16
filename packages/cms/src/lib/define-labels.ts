/**
 * Defines a type-safe label configuration.
 *
 * @example
 * ```ts
 * export const labelConfig = defineLabelConfig({
 *     locales: ['en', 'ar'] as const,
 *     defaultLocale: 'en',
 *     fallbackLocale: 'en', // Optional
 * });
 *
 * export type LabelConfig = typeof labelConfig;
 * export type AppLocale = typeof labelConfig.locales[number]; // 'en' | 'ar'
 * ```
 */
export function defineLabelConfig<const TLocales extends readonly string[]>(config: {
    locales: TLocales;
    defaultLocale: TLocales[number];
    fallbackLocale?: TLocales[number];
    useBrowserLanguage?: boolean;
})
{
    return config;
}

/**
 * Define nested label structure (tRPC-style)
 *
 * @example
 * ```ts
 * export const labels = defineLabels({
 *     home: {
 *         slogan: { en: "Welcome", ko: "환영합니다" },
 *         hero: {
 *             title: { en: "Hello", ko: "안녕하세요" }
 *         }
 *     },
 *     about: {
 *         title: { en: "About Us", ko: "회사 소개" }
 *     }
 * });
 *
 * // Usage
 * labels.home.slogan;
 * labels.home.hero.title;
 * labels.about.title;
 * ```
 */
export function defineLabels<const T>(labels: T)
{
    return labels;
}

export function format(template: string, vars: Record<string, string | number>): string
{
    return template.replace(/\{(\w+)}/g, (match, key) =>
    {
        const value = vars[key];

        return value !== undefined ? String(value) : match;
    });
}
