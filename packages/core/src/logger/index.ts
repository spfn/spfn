/**
 * Logger Module Exports
 *
 * Entry point for logger module (Pure re-export only)
 *
 * 💡 Usage examples:
 * ```typescript
 * import { logger } from '@spfn/core';
 *
 * // Basic usage
 * logger.info('Application started');
 * logger.error('Connection failed', error);
 *
 * // Create module-specific logger
 * const dbLogger = logger.child('database');
 * dbLogger.debug('Connecting to database...');
 *
 * // Add context
 * logger.warn('Retry attempt', { attempt: 3, delay: 1000 });
 * ```
 *
 * 💡 Adapter switching:
 * - Environment variable: LOGGER_ADAPTER=pino (default) or custom
 * - Pino: High performance, production-proven
 * - Custom: Full control, no Pino dependency
 */

// Logger Instance
export { logger } from './adapter-factory.js';

// Types
export type { LogLevel, LoggerAdapter } from './adapters/types.js';
