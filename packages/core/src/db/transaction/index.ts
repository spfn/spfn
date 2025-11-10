/**
 * Transaction Module
 *
 * Database transaction management with AsyncLocalStorage-based propagation
 */

// AsyncLocalStorage utilities
export { getTransaction, runWithTransaction, getTransactionContext } from './context';
export type { TransactionContext, TransactionDB } from './context';

// Transaction middleware
export { Transactional } from './middleware';
export type { TransactionalOptions } from './middleware';