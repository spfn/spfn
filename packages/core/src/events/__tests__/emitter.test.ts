import { describe, it, expect, beforeEach, vi } from 'vitest';
import { on, emit, off, clear, getEventEmitter, setEventEmitter } from '../emitter';
import { InMemoryEventEmitter } from '../adapters/memory';

describe('EventEmitter', () =>
{
    beforeEach(() =>
    {
        // Clean slate for each test
        clear();
        setEventEmitter(new InMemoryEventEmitter());

        // Mock console.error to prevent test output pollution
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    describe('Basic functionality', () =>
    {
        it('should emit and receive events', async () =>
        {
            const received: any[] = [];

            on('test:event', (data) =>
            {
                received.push(data);
            });

            await emit('test:event', { message: 'Hello' });

            expect(received).toHaveLength(1);
            expect(received[0]).toEqual({ message: 'Hello' });
        });

        it('should support multiple handlers for same event', async () =>
        {
            const results: string[] = [];

            on('test:event', () => results.push('handler1'));
            on('test:event', () => results.push('handler2'));
            on('test:event', () => results.push('handler3'));

            await emit('test:event');

            expect(results).toHaveLength(3);
            expect(results).toEqual(['handler1', 'handler2', 'handler3']);
        });

        it('should support async handlers', async () =>
        {
            const results: string[] = [];

            on('test:event', async () =>
            {
                await new Promise(resolve => setTimeout(resolve, 10));
                results.push('async-handler');
            });

            await emit('test:event');

            expect(results).toEqual(['async-handler']);
        });

        it('should handle events with no subscribers silently', async () =>
        {
            await expect(emit('non-existent:event', { data: 'test' })).resolves.toBeUndefined();
        });
    });

    describe('Error handling', () =>
    {
        it('should continue execution even if one handler fails', async () =>
        {
            const results: string[] = [];

            on('test:event', () => results.push('handler1'));
            on('test:event', () =>
            {
                throw new Error('Handler failed');
            });
            on('test:event', () => results.push('handler3'));

            await emit('test:event');

            // All handlers should execute despite one failing
            expect(results).toEqual(['handler1', 'handler3']);
        });

        it('should handle async handler errors', async () =>
        {
            const results: string[] = [];

            on('test:event', async () =>
            {
                await new Promise(resolve => setTimeout(resolve, 10));
                throw new Error('Async error');
            });

            on('test:event', () => results.push('other-handler'));

            await emit('test:event');

            expect(results).toEqual(['other-handler']);
        });
    });

    describe('Unsubscribe', () =>
    {
        it('should remove all handlers for an event', async () =>
        {
            const results: string[] = [];

            on('test:event', () => results.push('handler1'));
            on('test:event', () => results.push('handler2'));

            off('test:event');

            await emit('test:event');

            expect(results).toHaveLength(0);
        });

        it('should clear all event subscriptions', async () =>
        {
            const results: string[] = [];

            on('event1', () => results.push('event1'));
            on('event2', () => results.push('event2'));

            clear();

            await emit('event1');
            await emit('event2');

            expect(results).toHaveLength(0);
        });
    });

    describe('Adapter management', () =>
    {
        it('should allow switching adapters', () =>
        {
            const adapter1 = new InMemoryEventEmitter();
            const adapter2 = new InMemoryEventEmitter();

            setEventEmitter(adapter1);
            expect(getEventEmitter()).toBe(adapter1);

            setEventEmitter(adapter2);
            expect(getEventEmitter()).toBe(adapter2);
        });

        it('should use default InMemoryEventEmitter', () =>
        {
            const emitter = getEventEmitter();
            expect(emitter).toBeInstanceOf(InMemoryEventEmitter);
        });
    });

    describe('Real-world scenarios', () =>
    {
        it('should handle auth login event', async () =>
        {
            const auditLogs: any[] = [];
            const notifications: any[] = [];

            // Multiple subscribers for same event
            on('auth:user:login', (data) =>
            {
                auditLogs.push({
                    action: 'login',
                    userId: data.userId,
                    timestamp: data.timestamp,
                });
            });

            on('auth:user:login', async (data) =>
            {
                notifications.push({
                    type: 'email',
                    to: data.email,
                    subject: 'Login detected',
                });
            });

            // Emit login event
            await emit('auth:user:login', {
                userId: '123',
                email: 'test@example.com',
                timestamp: new Date(),
            });

            expect(auditLogs).toHaveLength(1);
            expect(notifications).toHaveLength(1);
            expect(auditLogs[0].userId).toBe('123');
            expect(notifications[0].to).toBe('test@example.com');
        });

        it('should handle user registration flow', async () =>
        {
            const events: string[] = [];

            on('auth:user:registered', () => events.push('registered'));
            on('email:welcome:sent', () => events.push('welcome-email'));
            on('analytics:user:tracked', () => events.push('analytics'));

            await emit('auth:user:registered', { userId: '123' });
            await emit('email:welcome:sent', { to: 'user@example.com' });
            await emit('analytics:user:tracked', { userId: '123' });

            expect(events).toEqual(['registered', 'welcome-email', 'analytics']);
        });
    });
});