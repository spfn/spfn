/**
 * Transaction Module
 *
 * Database transaction management with AsyncLocalStorage-based propagation
 */

// AsyncLocalStorage utilities
export { getTransaction, runWithTransaction, getTransactionContext, onAfterCommit } from './context';
export type { TransactionContext, TransactionDB, AfterCommitCallback } from './context';

// Transaction middleware
export { Transactional } from './middleware';
export type { TransactionalOptions } from './middleware';

// Transaction runner for scripts and CLI
export { runInTransaction } from './runner';
export type { RunInTransactionOptions } from './runner';
