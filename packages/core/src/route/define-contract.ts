import type { RouteContract } from './types';

/**
 * Helper function to define a route contract with type safety
 *
 * This eliminates the need to write `as const satisfies RouteContract`
 * and provides better type inference.
 *
 * @example
 * ```ts
 * export const getUserContract = defineContract({
 *   method: 'GET',
 *   path: '/users/:id',
 *   params: Type.Object({
 *     id: Type.String()
 *   }),
 *   response: ApiSuccessSchema(Type.Object({
 *     id: Type.String(),
 *     name: Type.String()
 *   }))
 * });
 * ```
 */
export function defineContract<T extends RouteContract>(contract: T): T
{
	return contract as T;
}