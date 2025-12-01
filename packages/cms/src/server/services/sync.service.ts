/**
 * CMS Label Synchronization Service
 *
 * Synchronizes labels defined in code with database
 */

import { isEqual } from 'lodash';
import { type SyncOptions, type SyncResult } from '../../lib/types';
import { type FlatLabel, flattenLabels } from '../../lib/helpers';
import { cmsLabelsRepository } from '../repositories';
import { type NewCmsLabel } from '../entities';

/**
 * Compare current DB labels with new labels
 *
 * @param dbLabels - Labels currently in database
 * @param codeLabels - Labels from code (flattened)
 * @returns Comparison result with added/removed/updated labels
 */
function compareLabels(dbLabels: FlatLabel, codeLabels: FlatLabel): SyncResult
{
    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];
    const unchanged: string[] = [];

    const dbKeys = Object.keys(dbLabels);
    const codeKeys = Object.keys(codeLabels);

    // Check for added and updated labels
    for (const key of codeKeys)
    {
        if (!(key in dbLabels))
        {
            // New label
            added.push(key);
        }
        else
        {
            // Check if values changed (deep equality check for nested objects)
            const dbValue = dbLabels[key];
            const codeValue = codeLabels[key];

            if (!isEqual(dbValue, codeValue))
            {
                updated.push(key);
            }
            else
            {
                unchanged.push(key);
            }
        }
    }

    // Check for removed labels
    for (const key of dbKeys)
    {
        if (!(key in codeLabels))
        {
            removed.push(key);
        }
    }

    return {
        added,
        removed,
        updated,
        unchanged,
    };
}

/**
 * Sync labels with database
 *
 * @param labels - Single label definition or array of label definitions
 * @param options - Sync options
 * @returns Sync result
 *
 * @example
 * ```typescript
 * // Single definition
 * await syncLabels(labelsDefinition);
 *
 * // Multiple definitions
 * await syncLabels([homeLabels, aboutLabels, commonLabels]);
 * ```
 */
export async function syncLabels<T extends Record<string, any>>(
    labels: T | T[],
    options?: SyncOptions
): Promise<SyncResult>
{
    const { removeOrphaned = false, dryRun = false } = options || {};

    // 1. Merge multiple label definitions into one (if array provided)
    const mergedLabels = Array.isArray(labels)
        ? Object.assign({}, ...labels)
        : labels;

    // 2. Flatten code labels
    const codeLabels = flattenLabels(mergedLabels);

    // 3. Fetch current labels from DB
    const dbLabels = await cmsLabelsRepository.findMany();
    const dbLabelMap: FlatLabel = {};

    for (const label of dbLabels)
    {
        if (label.defaultValue)
        {
            dbLabelMap[label.key] = label.defaultValue as Record<string, string>;
        }
    }

    // 4. Compare changes
    const result = compareLabels(dbLabelMap, codeLabels);

    // 5. Return result if dry run
    if (dryRun)
    {
        return result;
    }

    // 6. Create new labels
    if (result.added.length > 0)
    {
        const toCreate: NewCmsLabel[] = result.added.map(key => ({
            key,
            section: extractSection(key),
            type: 'text',
            defaultValue: codeLabels[key],
        }));

        await cmsLabelsRepository.bulkCreate(toCreate);
    }

    // 7. Update changed labels
    if (result.updated.length > 0)
    {
        const updates = result.updated.map(key => ({
            key,
            data: {
                defaultValue: codeLabels[key],
            },
        }));

        await cmsLabelsRepository.bulkUpdateByKeys(updates);
    }

    // 8. Remove deleted labels (only if option is true)
    if (removeOrphaned && result.removed.length > 0)
    {
        await cmsLabelsRepository.bulkDeleteByKeys(result.removed);
    }

    return result;
}

/**
 * Extract section from key
 * Example: "home.hero.title" -> "home"
 */
function extractSection(key: string): string
{
    const parts = key.split('.');
    return parts[0] || key;
}