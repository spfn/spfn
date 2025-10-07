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

// Types
export * from './types.js';