/**
 * CMS Helper Functions
 */

export type FlatLabel = Record<string, Record<string, string>>;

export type FlatLabelItem = {
    values: Record<string, string>;
    description?: string;
};

export type FlatLabelWithDescription = Record<string, FlatLabelItem>;

/**
 * Flatten nested label structure into dot notation
 *
 * @param labels - Nested label object
 * @param prefix - Key prefix for recursion
 * @returns Flattened label structure with description
 *
 * @example
 * ```typescript
 * const nested = {
 *   home: {
 *     hero: {
 *       title: {
 *         en: "Welcome",
 *         ko: "환영합니다",
 *         $description: "Main hero title"
 *       }
 *     }
 *   }
 * };
 *
 * const flat = flattenLabels(nested);
 * // {
 * //   "home.hero.title": {
 * //     values: { en: "Welcome", ko: "환영합니다" },
 * //     description: "Main hero title"
 * //   }
 * // }
 * ```
 */
export function flattenLabels<T extends Record<string, any>>(
    labels: T,
    prefix = '',
): FlatLabelWithDescription
{
    const result: FlatLabelWithDescription = {};

    if (!labels || typeof labels !== 'object')
    {
        return result;
    }

    const obj = labels as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj))
    {
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (!value || typeof value !== 'object')
        {
            continue;
        }

        const valueObj = value as Record<string, unknown>;

        // Check if this is a leaf node (locale values: { en: "...", ko: "...", $description?: "..." })
        // All values must be strings (including $description)
        const isLeaf = Object.values(valueObj).every(v => typeof v === 'string');

        if (isLeaf)
        {
            const { $description, ...localeValues } = valueObj as Record<string, string>;

            result[newKey] = {
                values: localeValues,
                description: $description,
            };
        }
        else
        {
            // Recursively flatten nested structure
            Object.assign(result, flattenLabels(value, newKey));
        }
    }

    return result;
}

/**
 * Set a value in nested object using dot notation path
 *
 * @param target - Target object to modify
 * @param path - Dot notation path (e.g., "home.hero.title")
 * @param value - Value to set
 *
 * @example
 * ```typescript
 * const obj = {};
 * setNestedValue(obj, "home.hero.title", "Welcome");
 * // obj = { home: { hero: { title: "Welcome" } } }
 * ```
 */
export function setNestedValue(target: any, path: string, value: any): void
{
    const parts = path.split('.');
    let current = target;

    for (let i = 0; i < parts.length - 1; i++)
    {
        const part = parts[i];
        if (!current[part])
        {
            current[part] = {};
        }
        current = current[part];
    }

    // Set the leaf value
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
}

/**
 * Unflatten dot notation keys back to nested structure
 *
 * @param flat - Flattened label object
 * @returns Nested label structure
 *
 * @example
 * ```typescript
 * const flat = {
 *   "home.hero.title": { en: "Welcome", ko: "환영합니다" },
 *   "home.hero.subtitle": { en: "Subtitle", ko: "부제목" }
 * };
 *
 * const nested = unflattenLabels(flat);
 * // {
 * //   home: {
 * //     hero: {
 * //       title: { en: "Welcome", ko: "환영합니다" },
 * //       subtitle: { en: "Subtitle", ko: "부제목" }
 * //     }
 * //   }
 * // }
 * ```
 */
export function unflattenLabels(flat: FlatLabel): Record<string, any>
{
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(flat))
    {
        setNestedValue(result, key, value);
    }

    return result;
}
