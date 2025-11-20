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

// tRPC-style route definition
export { route, defineRouter } from './define-route';
export type {
    RouteInput,
    RouteBuilderContext,
    RouteHandlerFn,
    RouteDef,
    HttpMethod,
    Router,
} from './define-route';

// Route registration for define-route
export { registerRoutes } from './register-routes';