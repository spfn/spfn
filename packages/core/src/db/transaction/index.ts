/**
 * Transaction Module
 *
 * Database transaction management with AsyncLocalStorage-based propagation
 */

// AsyncLocalStorage utilities
export {
    getTransaction,
    runWithTransaction,
    getTransactionContext,
    onBeforeCommit,
    onAfterCommit,
    onAfterRollback,
} from './context';
export type {
    TransactionContext,
    TransactionDB,
    NestedFrameGate,
    BeforeCommitCallback,
    AfterCommitCallback,
    AfterRollbackCallback,
} from './context';

// Transaction middleware
export { Transactional } from './middleware';
export type { TransactionalOptions } from './middleware';

// Transaction runner for scripts and CLI
export { runInTransaction } from './runner';
export type { RunInTransactionOptions } from './runner';
