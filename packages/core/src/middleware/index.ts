/**
 * @spfn/core - Middleware module exports
 */

export { ErrorHandler } from './error-handler';
export type { ErrorHandlerOptions, OnErrorContext } from './error-handler';
export { RequestLogger, maskSensitiveData } from './request-logger';
export type { RequestLoggerOptions, RequestLoggerConfig } from './request-logger';
export { createProxyGuard, createCacheNonceStore, createInMemoryNonceStore } from './proxy-guard';
export type { ProxyGuardConfig, ProxyGuardMode, ClientType, NonceStore } from './proxy-guard';
export { rateLimit, rateLimitPolicy, getClientIp, setRateLimitPolicies, getRateLimitPolicy, setRateLimitFailClosedDefault } from './rate-limit';
export type { RateLimitOptions, RateLimitDimension } from './rate-limit';
