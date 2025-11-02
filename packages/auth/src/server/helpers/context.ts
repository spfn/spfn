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
 * @example
 * ```typescript
 * app.bind(logoutContract, [authenticate], async (c) => {
 *     const { user, userId, keyId } = getAuth(c);
 *     // Use authenticated data...
 * });
 * ```
 */
export function getAuth(c: { raw: Context }): AuthContext
{
    return c.raw.get('auth');
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
export function getUser(c: { raw: Context })
{
    return c.raw.get('auth').user;
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
export function getUserId(c: { raw: Context }): string
{
    return c.raw.get('auth').userId;
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
export function getKeyId(c: { raw: Context }): string
{
    return c.raw.get('auth').keyId;
}