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
    if (staticSegments.length === 1)
    {
        return staticSegments[0];
    }

    // Convert to camelCase: users/posts → usersPosts
    const result: string[] = [staticSegments[0]];
    for (let i = 1; i < staticSegments.length; i++)
    {
        const seg = staticSegments[i];
        result.push(seg.charAt(0).toUpperCase() + seg.slice(1));
    }

    return result.join('');
}