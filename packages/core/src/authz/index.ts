/**
 * @spfn/core/authz - Authorization primitives
 *
 * Small, domain-agnostic guards for resource ownership. The point is to make the
 * "load, then check it belongs to the requester" step a single call so a handler
 * can't forget it and leak another user's data (IDOR).
 */

import { NotFoundError } from '../errors';

export interface RequireOwnerOptions<T>
{
    /**
     * Property on the resource holding the owner id. Defaults to `'ownerId'`.
     * SPFN entities commonly use `userId` / `createdBy` — pass it explicitly:
     * `requireOwner(doc, userId, { ownerKey: 'userId' })`.
     */
    ownerKey?: keyof T;

    /** Message for the thrown NotFoundError. @default 'not found' */
    message?: string;
}

/**
 * Return the resource only if it exists and belongs to `ownerId`; otherwise throw
 * `NotFoundError`. Not-found and not-owned are deliberately the same response, so
 * the endpoint never reveals that a resource exists to a non-owner.
 *
 * Ids are compared as strings, so number/string/bigint ids interoperate. A
 * missing or null owner value never matches, so it throws.
 *
 * @example
 * ```ts
 * const chat = requireOwner(await chats.findById(id), userId, { ownerKey: 'userId' });
 * // chat is non-null here, narrowed from T | null
 * ```
 */
export function requireOwner<T extends object>(
    resource: T | null | undefined,
    ownerId: string | number | bigint,
    options: RequireOwnerOptions<T> = {},
): T
{
    const ownerKey = (options.ownerKey ?? 'ownerId') as keyof T;
    const value = resource ? (resource as Record<PropertyKey, unknown>)[ownerKey] : undefined;

    if (!resource || value === null || value === undefined || String(value) !== String(ownerId))
    {
        throw new NotFoundError({ message: options.message ?? 'not found' });
    }

    return resource;
}
