import { createApi } from "@spfn/core/nextjs";
import { errorRegistry } from "@spfn/core/errors";
import { logger } from "@spfn/core/logger";
import { type AppRouter, appMetadata } from './server/routes/index';
import { bindLocale, type BoundLabels } from './lib/bind-locale';
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
 * Create CMS client with API, label getter, and format utility
 *
 * @param labelsDefinition - Labels defined using defineLabels()
 * @param config - Label config from defineLabelConfig()
 * @returns API client, getLabels function, and format utility
 *
 * @example
 * ```typescript
 * // labels.ts - Setup once
 * export const { api, getLabels, format } = createCmsClient(labelsDefinition, labelConfig);
 *
 * // Use anywhere
 * const labels = await getLabels('home');
 * labels.home.hero.title // "Hello"
 *
 * // With template variables
 * const greeting = labels.home.hero.greeting; // "Hello {name}"
 * format(greeting, { name: "John" }); // "Hello John"
 *
 * // Multiple variables
 * const message = labels.notification.text; // "You have {count} new messages"
 * format(message, { count: 5 }); // "You have 5 new messages"
 *
 * // API routes
 * await api.someRoute.call();
 * ```
 */
export function createCmsClient<T>(
    labelsDefinition: T,
    config: { defaultLocale: string; fallbackLocale?: string }
)
{
    async function getLabels(sections: string | string[]): Promise<BoundLabels<T>>
    {
        // Auto-detect locale from cookie, fallback to config.defaultLocale
        const locale = await getLocale(config.defaultLocale);

        // Normalize sections to array
        const sectionArray = Array.isArray(sections) ? sections : [sections];

        cmsLogger.debug('getLabels called', {
            sections: sectionArray,
            locale,
            defaultLocale: config.defaultLocale,
            fallbackLocale: config.fallbackLocale,
            availableDefinitionKeys: Object.keys(labelsDefinition as any),
        });

        // 1. Fetch from published_cache
        const cache = await api.getLabelCache.call({
            sections: sectionArray,
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
        for (const section of sectionArray)
        {
            if (section in (labelsDefinition as any))
            {
                filteredLabels[section] = (labelsDefinition as any)[section];
            }
        }

        cmsLogger.debug('Filtered sections', {
            requestedSections: sectionArray,
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

        return merged as BoundLabels<T>;
    }

    return { api, getLabels, format };
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