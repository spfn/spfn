/**
 * @spfn/core/events
 *
 * Adapter-based event emitter for decoupled communication.
 *
 * @example
 * ```typescript
 * import { on, emit } from '@spfn/core/events';
 *
 * // Subscribe
 * on('user:created', (data) => {
 *   console.log('User created:', data.email);
 * });
 *
 * // Emit
 * await emit('user:created', { email: 'test@example.com' });
 * ```
 */

export * from './types';
export * from './emitter';
export * from './adapters/memory';