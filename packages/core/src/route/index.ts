/**
 * @spfn/core - Route module exports
 */

// Auto Route Loader (Simplified)
export { AutoRouteLoader, loadRoutes } from './auto-loader';
export type { RouteInfo, RouteStats } from './auto-loader';

// Contract-based validation
export { bind } from './bind';

// App factory
export { createApp } from './create-app';
export type { SPFNApp } from './create-app';