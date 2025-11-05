/**
 * Auth Context Helpers
 *
 * Helper functions to access authenticated user data from route context
 */

import type { Context } from 'hono';
import type { AuthContext } from '../middleware/authenticate.js';

/**
 * Get auth context from route context
 *
 * Accepts both raw Hono Context and RouteContext with raw property
 *
 * @example
 * ```typescript
 * // With RouteContext (RPC routes)
 * app.bind(logoutContract, [authenticate], async (c) => {
 *     const { user, userId, keyId } = getAuth(c);
 *     // Use authenticated data...
 * });
 *
 * // With raw Context (middleware)
 * const auth = getAuth(c);
 * ```
 */
export function getAuth(c: Context | { raw: Context }): AuthContext
{
    // Check if it's RouteContext with raw property
    if ('raw' in c && c.raw)
    {
        return c.raw.get('auth');
    }

    // Otherwise, it's raw Hono Context
    return (c as Context).get('auth');
}

/**
 * Get authenticated user from route context
 *
 * @example
 * ```typescript
 * app.bind(profileContract, [authenticate], async (c) => {
 *     const user = getUser(c);
 *     return c.success({ email: user.email });
 * });
 * ```
 */
export function getUser(c: Context | { raw: Context })
{
    return getAuth(c).user;
}

/**
 * Get authenticated user ID from route context
 *
 * @example
 * ```typescript
 * app.bind(postsContract, [authenticate], async (c) => {
 *     const userId = getUserId(c);
 *     const posts = await findPosts({ authorId: userId });
 * });
 * ```
 */
export function getUserId(c: Context | { raw: Context }): string
{
    return getAuth(c).userId;
}

/**
 * Get current key ID from route context
 *
 * @example
 * ```typescript
 * app.bind(rotateKeyContract, [authenticate], async (c) => {
 *     const oldKeyId = getKeyId(c);
 *     // Revoke old key...
 * });
 * ```
 */
export function getKeyId(c: Context | { raw: Context }): string
{
    return getAuth(c).keyId;
}