/**
 * Route Type Definitions
 */

export type HeaderRecord = Record<string, string | string[]>;

export type RouteMeta = {
    public?: boolean;
    skipMiddlewares?: string[];
    tags?: string[];
    description?: string;
    deprecated?: boolean;
};

/**
 * Extract data type from ApiSuccessResponse<T>
 *
 * If response type is ApiSuccessResponse<T>, extracts T (the data field type).
 * Otherwise, returns the response type as-is.
 */
export type InferResponseData<T> = T extends { success: true; data: infer D } ? D : T;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Route metadata for codegen
 */
export interface RouteMetadata
{
    method: string;
    path: string;
}

/**
 * Router metadata containing all routes
 */
export interface RouterMetadata
{
    routes: Record<string, RouteMetadata>;
    routerTypeName: string;
}
