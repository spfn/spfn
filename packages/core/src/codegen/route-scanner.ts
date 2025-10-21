/**
 * Route Scanner Utilities
 *
 * Helper functions for grouping and organizing route-contract mappings
 */

import type { RouteContractMapping } from './types.js';

/**
 * Group mappings by resource
 */
export function groupByResource(mappings: RouteContractMapping[]): Record<string, RouteContractMapping[]>
{
    const grouped: Record<string, RouteContractMapping[]> = {};

    for (let i = 0; i < mappings.length; i++)
    {
        const mapping = mappings[i];
        const resource = extractResourceName(mapping.path);

        if (!grouped[resource])
        {
            grouped[resource] = [];
        }

        grouped[resource].push(mapping);
    }

    return grouped;
}

/**
 * Extract resource name from path
 *
 * Examples:
 * - /users → users
 * - /users/:id → users
 * - /users/:id/posts → usersPosts
 * - /videos/upload-and-analyze → videosUploadAndAnalyze
 */
function extractResourceName(path: string): string
{
    // Remove leading slash
    const segments = path.slice(1).split('/').filter(s => s && s !== '*');

    // Remove dynamic segments
    const staticSegments: string[] = [];
    for (let i = 0; i < segments.length; i++)
    {
        const seg = segments[i];
        if (!seg.startsWith(':'))
        {
            staticSegments.push(seg);
        }
    }

    // Join with camelCase
    if (staticSegments.length === 0)
    {
        return 'root';
    }

    // Convert first segment (handle hyphens)
    const first = toCamelCase(staticSegments[0], false);

    if (staticSegments.length === 1)
    {
        return first;
    }

    // Convert to camelCase: users/posts → usersPosts, videos/upload-and-analyze → videosUploadAndAnalyze
    const result: string[] = [first];
    for (let i = 1; i < staticSegments.length; i++)
    {
        const seg = staticSegments[i];
        result.push(toCamelCase(seg, true));
    }

    return result.join('');
}

/**
 * Convert string to camelCase, handling hyphens
 *
 * @param str - Input string
 * @param capitalize - Capitalize first letter
 * @returns camelCase string
 *
 * Examples:
 * - toCamelCase('upload-and-analyze', true) → 'UploadAndAnalyze'
 * - toCamelCase('upload-and-analyze', false) → 'uploadAndAnalyze'
 * - toCamelCase('users', false) → 'users'
 */
function toCamelCase(str: string, capitalize: boolean): string
{
    // Split by hyphen or underscore
    const parts = str.split(/[-_]/);

    if (parts.length === 1)
    {
        // No hyphens/underscores
        return capitalize
            ? str.charAt(0).toUpperCase() + str.slice(1)
            : str;
    }

    // Convert to camelCase
    const result: string[] = [];
    for (let i = 0; i < parts.length; i++)
    {
        const part = parts[i];
        if (i === 0 && !capitalize)
        {
            result.push(part);
        }
        else
        {
            result.push(part.charAt(0).toUpperCase() + part.slice(1));
        }
    }

    return result.join('');
}