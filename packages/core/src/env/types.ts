/**
 * Environment Types
 */

/**
 * Node.js environment types
 */
export type NodeEnv = 'local' | 'development' | 'staging' | 'production' | 'test';

/**
 * Re-export LogLevel from logger module to avoid duplication
 */
export type { LogLevel } from '../logger/types';
