/**
 * Logger Module Exports
 *
 * Entry point for logger module
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
 * 💡 Transports:
 * - Console: Colored output for development, JSON for production
 * - File: Automatic file logging in production (LOG_FILE_ENABLED=true)
 * - Future: Slack, Email, and custom transports
 */

// Logger Instance
export { logger } from './factory.js';
export { Logger } from './logger.js';

// Types
export type { LogLevel, Transport } from './types.js';
