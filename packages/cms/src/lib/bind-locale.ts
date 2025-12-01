/**
 * Bind locale to labels, returning locale-specific values
 *
 * @example
 * ```ts
 * const labelsDefinition = defineLabels({
 *     home: {
 *         title: { en: "Home", ko: "홈" }
 *     }
 * });
 *
 * const labels = bindLocale(labelsDefinition, 'ko');
 * labels.home.title // "홈"
 * ```
 */

/**
 * Type that converts locale records to strings
 */
export type BoundLabels<T> = {
    [K in keyof T]: T[K] extends Record<string, any>
        ? IsLocaleRecord<T[K]> extends true
            ? string
            : BoundLabels<T[K]>
        : T[K];
};

/**
 * Check if object is a locale record (has string values only)
 */
type IsLocaleRecord<T> = T extends Record<string, string> ? true : false;

/**
 * Check if an object is a locale record at runtime
 */
function isLocaleRecord(obj: any): boolean
{
    if (!obj || typeof obj !== 'object')
    {
        return false;
    }

    const values = Object.values(obj);

    // Empty object is not a locale record
    if (values.length === 0)
    {
        return false;
    }

    // All values must be strings
    return values.every(v => typeof v === 'string');
}

/**
 * Bind a locale to label definitions, returning locale-specific values
 *
 * @param labels - Label definitions with locale records
 * @param locale - Locale to bind (e.g., 'en', 'ko')
 * @param fallbackLocale - Optional fallback locale if value not found
 * @returns Labels with locale-specific string values
 *
 * @example
 * ```typescript
 * const labelsDefinition = defineLabels({
 *     home: {
 *         title: { en: "Home", ko: "홈" },
 *         hero: {
 *             title: { en: "Welcome", ko: "환영합니다" }
 *         }
 *     }
 * });
 *
 * const labels = bindLocale(labelsDefinition, 'ko');
 * labels.home.title // "홈"
 * labels.home.hero.title // "환영합니다"
 *
 * // With fallback
 * const labelsEn = bindLocale(labelsDefinition, 'en', 'ko');
 * ```
 */
export function bindLocale<T>(
    labels: T,
    locale: string,
    fallbackLocale?: string
): BoundLabels<T>
{
    return createProxy(labels, locale, fallbackLocale) as BoundLabels<T>;
}

/**
 * Create a proxy that intercepts property access and returns locale-specific values
 */
function createProxy(obj: any, locale: string, fallbackLocale?: string): any
{
    return new Proxy(obj, {
        get(target, prop)
        {
            const value = target[prop];

            // If value doesn't exist, return undefined
            if (value === undefined)
            {
                return undefined;
            }

            // If this is a locale record, return the locale value
            if (isLocaleRecord(value))
            {
                // Try to get the requested locale
                if (value[locale] !== undefined)
                {
                    return value[locale];
                }

                // Fallback to fallbackLocale if specified
                if (fallbackLocale && value[fallbackLocale] !== undefined)
                {
                    return value[fallbackLocale];
                }

                // If locale not found, return first available locale
                const firstLocale = Object.keys(value)[0];
                return value[firstLocale];
            }

            // If this is a nested object, wrap it in a proxy
            if (typeof value === 'object' && value !== null)
            {
                return createProxy(value, locale, fallbackLocale);
            }

            // Otherwise return as-is
            return value;
        },
    });
}