/**
 * @spfn/core - Route module exports
 */
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
export { defineMiddleware } from './define-middleware';
export type { ExtractMiddlewareNames, NamedMiddlewareFactory, NamedMiddleware } from './define-middleware';
export type * from './types';