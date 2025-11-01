/**
 * @spfn/core - Route module exports
 */

// Auto Route Loader (Simplified)
export { AutoRouteLoader, loadRoutes } from './auto-loader.js';
export type { RouteInfo, RouteStats } from './auto-loader.js';

// Contract-based validation
export { bind } from './bind.js';

// App factory
export { createApp } from './create-app.js';
export type { SPFNApp } from './create-app.js';

// API Response helpers (optional)
export {
  success,
  error,
  paginated,
  ApiSuccessSchema,
  ApiErrorSchema,
  ApiResponseSchema,
} from './api-response.js';
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
} from './api-response.js';

// Types
export * from './types.js';