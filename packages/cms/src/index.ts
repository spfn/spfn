import { createApi } from "@spfn/core/nextjs";
import { errorRegistry } from "@spfn/core/errors";
import { logger } from "@spfn/core/logger";
import { type AppRouter, appMetadata } from './server/routes/index';
import { bindLocale, type SectionKeys, type BoundLabelSection, type BoundLabelsSections } from './lib/bind-locale';
import { getLocale } from './actions';
import { setNestedValue } from './lib/helpers';
import { format, defineLabelConfig, defineLabels } from './lib/define-labels';

const cmsLogger = logger.child('@spfn/cms');

/**
 * Default API client (for backward compatibility or when not using labels)
 */
const api = createApi<AppRouter>({
    metadata: appMetadata,
    errorRegistry: errorRegistry
});

/**
 * Create CMS client with API, label getters, and format utility
 *
 * @param labelsDefinition - Labels defined using defineLabels()
 * @param config - Label config from defineLabelConfig()
 * @returns API client, getLabel (single), getLabels (multiple), and format utility
 *
 * @example
 * ```typescript
 * // labels.ts - Setup once
 * export const { api, getLabel, getLabels, format } = createCmsClient(labelsDefinition, labelConfig);
 *
 * // Single section - direct access
 * const label = await getLabel('home');
 * label.hero.title // "Hello" (no section name!)
 *
 * // Multiple sections - with section names
 * const labels = await getLabels(['home', 'about']);
 * labels.home.hero.title // "Hello"
 * labels.about.title // "About Us"
 *
 * // With template variables
 * const greeting = label.hero.greeting; // "Hello {name}"
 * format(greeting, { name: "John" }); // "Hello John"
 * ```
 */
export function createCmsClient<T>(
    labelsDefinition: T,
    config: { defaultLocale: string; fallbackLocale?: string }
)
{
    /**
     * Get a single section's labels (without section name wrapper)
     *
     * @param section - Section name to fetch
     * @returns Labels for the section, directly accessible
     *
     * @example
     * ```typescript
     * const label = await getLabel('signup');
     * label.title // Direct access
     * label.userName
     * ```
     */
    async function getLabel<K extends SectionKeys<T>>(section: K): Promise<BoundLabelSection<T, K>>
    {
        // Auto-detect locale from cookie, fallback to config.defaultLocale
        const locale = await getLocale(config.defaultLocale);

        cmsLogger.debug('getLabel called', {
            section,
            locale,
            defaultLocale: config.defaultLocale,
            fallbackLocale: config.fallbackLocale,
        });

        // 1. Fetch from published_cache
        const cache = await api.getLabelCache.call({
            sections: [section as string],
            locale
        });

        // 2. Filter only requested section
        const filteredLabels: any = {};
        if (section in (labelsDefinition as any))
        {
            filteredLabels[section] = (labelsDefinition as any)[section];
        }

        // 3. Generate defaults with locale binding
        const defaults = bindLocale(filteredLabels, locale, config.fallbackLocale);

        // 4. Merge: cache takes priority, fallback to defaults
        const merged = deepMergeCache(defaults, cache, locale);

        // 5. Return only the section content (without section name)
        return merged[section] as BoundLabelSection<T, K>;
    }

    /**
     * Get multiple sections' labels (with section names as keys)
     *
     * @param sections - Array of section names to fetch
     * @returns Object with section names as keys
     *
     * @example
     * ```typescript
     * const labels = await getLabels(['home', 'about']);
     * labels.home.title
     * labels.about.description
     * ```
     */
    async function getLabels<K extends SectionKeys<T>>(sections: readonly K[]): Promise<BoundLabelsSections<T, K>>
    {
        // Auto-detect locale from cookie, fallback to config.defaultLocale
        const locale = await getLocale(config.defaultLocale);

        cmsLogger.debug('getLabels called', {
            sections,
            locale,
            defaultLocale: config.defaultLocale,
            fallbackLocale: config.fallbackLocale,
            availableDefinitionKeys: Object.keys(labelsDefinition as any),
        });

        // 1. Fetch from published_cache
        const cache = await api.getLabelCache.call({
            sections: [...sections] as unknown as string[],
            locale
        });

        cmsLogger.debug('Fetched from cache', {
            cacheKeys: Object.keys(cache),
            cacheEntryCount: Object.keys(cache).length,
            cacheStructure: Object.entries(cache).map(([key, value]) => ({
                section: key,
                isObject: typeof value === 'object',
                isNull: value === null,
                contentKeys: value && typeof value === 'object' ? Object.keys(value) : [],
            })),
        });

        // 2. Filter only requested sections (performance optimization)
        const filteredLabels: any = {};
        for (const section of sections)
        {
            if (section in (labelsDefinition as any))
            {
                filteredLabels[section] = (labelsDefinition as any)[section];
            }
        }

        cmsLogger.debug('Filtered sections', {
            requestedSections: sections,
            filteredSections: Object.keys(filteredLabels),
            filteredLabelsStructure: Object.entries(filteredLabels).map(([key, value]) => ({
                section: key,
                hasValue: !!value,
                isObject: typeof value === 'object',
                nestedKeys: value && typeof value === 'object' ? Object.keys(value) : [],
            })),
        });

        // 3. Generate defaults with locale binding (only for requested sections)
        const defaults = bindLocale(filteredLabels, locale, config.fallbackLocale);

        cmsLogger.debug('Generated defaults with locale binding', {
            defaultsKeys: Object.keys(defaults),
        });

        // 4. Merge: cache takes priority, fallback to defaults
        const merged = deepMergeCache(defaults, cache, locale);

        cmsLogger.debug('Merged cache and defaults', {
            mergedKeys: Object.keys(merged),
        });

        return merged as BoundLabelsSections<T, K>;
    }

    return { api, getLabel, getLabels, format };
}

/**
 * Deep merge cache into defaults
 */
function deepMergeCache(defaults: any, cache: Record<string, any>, locale: string): any
{
    const result = { ...defaults };

    cmsLogger.debug('deepMergeCache: Starting merge', {
        cacheEntries: Object.keys(cache).length,
        locale,
    });

    for (const [section, content] of Object.entries(cache))
    {
        if (!content || typeof content !== 'object')
        {
            cmsLogger.debug('deepMergeCache: Skipping invalid content', { section });
            continue;
        }

        const contentKeys = Object.keys(content);
        cmsLogger.debug('deepMergeCache: Processing section', {
            section,
            labelCount: contentKeys.length,
        });

        for (const [flatKey, value] of Object.entries(content))
        {
            // Extract locale-specific value from LabelValue format
            let extractedValue: any;

            if (value && typeof value === 'object' && 'content' in value)
            {
                extractedValue = (value as any).content;
                cmsLogger.debug('deepMergeCache: Extracted from content field', {
                    flatKey,
                    hasContent: true,
                });
            }
            else if (value && typeof value === 'object' && locale in value)
            {
                extractedValue = (value as any)[locale];
                cmsLogger.debug('deepMergeCache: Extracted from locale field', {
                    flatKey,
                    locale,
                });
            }
            else
            {
                extractedValue = value;
                cmsLogger.debug('deepMergeCache: Using raw value', {
                    flatKey,
                    valueType: typeof value,
                });
            }

            // Set value using helper function
            setNestedValue(result, flatKey, extractedValue);
        }
    }

    cmsLogger.debug('deepMergeCache: Merge completed', {
        resultKeys: Object.keys(result),
    });

    return result;
}

/**
 * Re-export format utility for standalone use
 *
 * @example
 * ```typescript
 * import { format } from '@spfn/cms/api-client';
 *
 * const text = "Hello {name}, you have {count} messages";
 * format(text, { name: "John", count: 5 });
 * // "Hello John, you have 5 messages"
 * ```
 */
export { format, defineLabelConfig, defineLabels };

/**
 * Re-export types for external use
 */
export type { BoundLabels, SectionKeys, BoundLabelSection, BoundLabelsSections } from './lib/bind-locale';