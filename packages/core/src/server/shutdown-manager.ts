/**
 * Shutdown Manager
 *
 * Manages graceful shutdown with drain behavior.
 * All tracked operations must complete before shutdown proceeds.
 *
 * Features:
 * - Hook registry: Multiple modules can register independent cleanup handlers
 * - Operation tracking: Long-running tasks are awaited during shutdown (drain)
 * - State management: isShuttingDown() for rejecting new work
 */

import { serverLogger } from './logger';

// ============================================================================
// Types
// ============================================================================

export interface ShutdownHookOptions
{
    /**
     * Timeout for this hook in milliseconds
     * If the hook exceeds this time, it is skipped and the next hook runs
     * @default 10000 (10s)
     */
    timeout?: number;

    /**
     * Execution order (lower runs first)
     * @default 100
     */
    order?: number;
}

interface ShutdownHook
{
    name: string;
    handler: () => Promise<void>;
    timeout: number;
    order: number;
}

interface TrackedOperation
{
    name: string;
    startedAt: number;
}

type ShutdownState = 'running' | 'draining' | 'closed';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HOOK_TIMEOUT = 10_000;
const DEFAULT_HOOK_ORDER = 100;
const DRAIN_POLL_INTERVAL = 500;

// ============================================================================
// ShutdownManager
// ============================================================================

export class ShutdownManager
{
    private state: ShutdownState = 'running';
    private hooks: ShutdownHook[] = [];
    private operations = new Map<string, TrackedOperation>();
    private operationCounter = 0;

    /**
     * Register a shutdown hook
     *
     * Hooks run in order during shutdown, after all tracked operations drain.
     * Each hook has its own timeout — failure does not block subsequent hooks.
     *
     * @example
     * shutdown.onShutdown('ai-service', async () => {
     *     await aiService.cancelPending();
     * }, { timeout: 30000, order: 10 });
     */
    onShutdown(
        name: string,
        handler: () => Promise<void>,
        options?: ShutdownHookOptions
    ): void
    {
        this.hooks.push({
            name,
            handler,
            timeout: options?.timeout ?? DEFAULT_HOOK_TIMEOUT,
            order: options?.order ?? DEFAULT_HOOK_ORDER,
        });

        // Keep sorted by order
        this.hooks.sort((a, b) => a.order - b.order);

        serverLogger.debug(`Shutdown hook registered: ${name}`, {
            order: options?.order ?? DEFAULT_HOOK_ORDER,
            timeout: `${options?.timeout ?? DEFAULT_HOOK_TIMEOUT}ms`,
        });
    }

    /**
     * Track a long-running operation
     *
     * During shutdown (drain phase), the process waits for ALL tracked
     * operations to complete before proceeding with cleanup.
     *
     * If shutdown has already started, the operation is rejected immediately.
     *
     * @returns The operation result (pass-through)
     *
     * @example
     * const result = await shutdown.trackOperation(
     *     'ai-generate',
     *     aiService.generate(prompt)
     * );
     */
    async trackOperation<T>(name: string, operation: Promise<T>): Promise<T>
    {
        if (this.state !== 'running')
        {
            throw new Error(`Cannot start operation '${name}': server is shutting down`);
        }

        const id = `${name}-${++this.operationCounter}`;

        this.operations.set(id, {
            name,
            startedAt: Date.now(),
        });

        serverLogger.debug(`Operation tracked: ${id}`, {
            activeOperations: this.operations.size,
        });

        try
        {
            return await operation;
        }
        finally
        {
            this.operations.delete(id);

            serverLogger.debug(`Operation completed: ${id}`, {
                activeOperations: this.operations.size,
            });
        }
    }

    /**
     * Whether the server is shutting down
     *
     * Use this to reject new work early (e.g., return 503 in route handlers).
     */
    isShuttingDown(): boolean
    {
        return this.state !== 'running';
    }

    /**
     * Number of currently active tracked operations
     */
    getActiveOperationCount(): number
    {
        return this.operations.size;
    }

    /**
     * Mark shutdown as started immediately
     *
     * Call this at the very beginning of the shutdown sequence so that:
     * - Health check returns 503 right away
     * - trackOperation() rejects new work
     * - isShuttingDown() returns true
     */
    beginShutdown(): void
    {
        if (this.state !== 'running')
        {
            return;
        }
        this.state = 'draining';
        serverLogger.info('Shutdown manager: state set to draining');
    }

    /**
     * Execute the full shutdown sequence
     *
     * 1. State → draining (reject new operations)
     * 2. Wait for all tracked operations to complete (drain)
     * 3. Run shutdown hooks in order
     * 4. State → closed
     *
     * @param drainTimeout - Max time to wait for operations to drain (ms)
     */
    async execute(drainTimeout: number): Promise<void>
    {
        // beginShutdown() may have already been called
        if (this.state === 'closed')
        {
            serverLogger.warn('ShutdownManager.execute() called but already closed');
            return;
        }

        this.state = 'draining';
        serverLogger.info('Shutdown manager: draining started', {
            activeOperations: this.operations.size,
            registeredHooks: this.hooks.length,
            drainTimeout: `${drainTimeout}ms`,
        });

        // Phase 1: Drain — wait for all tracked operations to complete
        await this.drain(drainTimeout);

        // Phase 2: Run shutdown hooks in order
        await this.executeHooks();

        this.state = 'closed';
        serverLogger.info('Shutdown manager: all hooks executed');
    }

    // ========================================================================
    // Private
    // ========================================================================

    /**
     * Wait for all tracked operations to complete, up to drainTimeout
     */
    private async drain(drainTimeout: number): Promise<void>
    {
        if (this.operations.size === 0)
        {
            serverLogger.info('Shutdown manager: no active operations, drain skipped');
            return;
        }

        serverLogger.info(`Shutdown manager: waiting for ${this.operations.size} operations to drain...`);

        const deadline = Date.now() + drainTimeout;

        while (this.operations.size > 0 && Date.now() < deadline)
        {
            const remaining = deadline - Date.now();
            const ops = Array.from(this.operations.values()).map(op => ({
                name: op.name,
                elapsed: `${Math.round((Date.now() - op.startedAt) / 1000)}s`,
            }));

            serverLogger.info('Shutdown manager: drain in progress', {
                activeOperations: this.operations.size,
                remainingTimeout: `${Math.round(remaining / 1000)}s`,
                operations: ops,
            });

            await sleep(Math.min(DRAIN_POLL_INTERVAL, remaining));
        }

        if (this.operations.size > 0)
        {
            const abandoned = Array.from(this.operations.values()).map(op => op.name);
            serverLogger.warn('Shutdown manager: drain timeout — abandoning operations', {
                abandoned,
            });
        }
        else
        {
            serverLogger.info('Shutdown manager: all operations drained successfully');
        }
    }

    /**
     * Execute registered shutdown hooks in order
     */
    private async executeHooks(): Promise<void>
    {
        if (this.hooks.length === 0)
        {
            return;
        }

        serverLogger.info(`Shutdown manager: executing ${this.hooks.length} hooks...`);

        for (const hook of this.hooks)
        {
            serverLogger.debug(`Shutdown hook [${hook.name}] starting (timeout: ${hook.timeout}ms)`);

            try
            {
                await withTimeout(
                    hook.handler(),
                    hook.timeout,
                    `Shutdown hook '${hook.name}' timeout after ${hook.timeout}ms`
                );
                serverLogger.info(`Shutdown hook [${hook.name}] completed`);
            }
            catch (error)
            {
                serverLogger.error(
                    `Shutdown hook [${hook.name}] failed`,
                    error as Error
                );
                // Continue with next hook — don't block shutdown
            }
        }
    }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: ShutdownManager | null = null;

/**
 * Get the global ShutdownManager instance
 *
 * Available after server starts. Use this to register shutdown hooks
 * or track long-running operations.
 *
 * @example
 * import { getShutdownManager } from '@spfn/core/server';
 *
 * const shutdown = getShutdownManager();
 *
 * // Register cleanup
 * shutdown.onShutdown('my-service', async () => {
 *     await myService.close();
 * });
 *
 * // Track long operation
 * await shutdown.trackOperation('ai-task', longRunningPromise);
 */
export function getShutdownManager(): ShutdownManager
{
    if (!instance)
    {
        instance = new ShutdownManager();
    }
    return instance;
}

/**
 * Reset the singleton (for testing)
 * @internal
 */
export function resetShutdownManager(): void
{
    instance = null;
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void>
{
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    message: string
): Promise<T>
{
    let timeoutId: NodeJS.Timeout | undefined;

    return Promise.race([
        promise.finally(() =>
        {
            if (timeoutId) clearTimeout(timeoutId);
        }),
        new Promise<never>((_, reject) =>
        {
            timeoutId = setTimeout(() =>
            {
                reject(new Error(message));
            }, timeout);
        }),
    ]);
}
