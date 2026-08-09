/**
 * SPFN Server
 *
 * Main entry point for server functionality.
 */

export { createServer } from './create-server';
export { CORE_NAMESPACE, CORE_HEALTH_PATH } from './namespace';
export { startServer } from './start-server';
export { validateServerConfig } from './validation';
export { printBanner } from './banner';
export { getShutdownManager } from './shutdown-manager';
export type { ShutdownHookOptions } from './shutdown-manager';
export * from './types';
