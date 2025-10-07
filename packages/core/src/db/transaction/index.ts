/**
 * Transaction Module
 *
 * Database transaction management with AsyncLocalStorage-based propagation
 */

// AsyncLocalStorage utilities
export { getTransaction, runWithTransaction } from './context.js';
export type { TransactionContext, TransactionDB } from './context.js';

// Transaction middleware
export { Transactional } from './middleware.js';
export type { TransactionalOptions } from './middleware.js';