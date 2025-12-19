import { describe, it, expect, vi } from 'vitest';
import { consoleProvider, emailProvider, slackProvider } from '../providers';
import type { WorkflowEvent } from '../../builder/types';

describe('notification providers', () =>
{
    const baseEvent: WorkflowEvent = {
        type: 'started',
        workflowName: 'test-workflow',
        executionId: 'exec-123',
        timestamp: new Date('2024-01-01T00:00:00Z'),
    };

    describe('consoleProvider', () =>
    {
        it('should log started event', async () =>
        {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await consoleProvider.notify({
                ...baseEvent,
                type: 'started',
            });

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[Workflow:test-workflow]'),
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Started'),
            );

            consoleSpy.mockRestore();
        });

        it('should log completed event', async () =>
        {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await consoleProvider.notify({
                ...baseEvent,
                type: 'completed',
            });

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Completed'),
            );

            consoleSpy.mockRestore();
        });

        it('should log failed event to console.error', async () =>
        {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await consoleProvider.notify({
                ...baseEvent,
                type: 'failed',
                error: 'Something went wrong',
            });

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed'),
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Something went wrong'),
            );

            consoleSpy.mockRestore();
        });

        it('should log step events', async () =>
        {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await consoleProvider.notify({
                ...baseEvent,
                type: 'step.started',
                stepName: 'create-repo',
                stepIndex: 0,
            });

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Step 'create-repo' started"),
            );

            consoleSpy.mockRestore();
        });
    });

    describe('emailProvider', () =>
    {
        it('should call send function with correct parameters', async () =>
        {
            const sendFn = vi.fn().mockResolvedValue(undefined);

            const provider = emailProvider({
                to: ['admin@example.com'],
                from: 'noreply@example.com',
                send: sendFn,
            });

            await provider.notify({
                ...baseEvent,
                type: 'failed',
                error: 'Database connection failed',
            });

            expect(sendFn).toHaveBeenCalledWith({
                to: ['admin@example.com'],
                from: 'noreply@example.com',
                subject: expect.stringContaining('test-workflow'),
                body: expect.stringContaining('failed'),
            });
        });

        it('should use custom subject template', async () =>
        {
            const sendFn = vi.fn().mockResolvedValue(undefined);

            const provider = emailProvider({
                to: ['admin@example.com'],
                from: 'noreply@example.com',
                subject: '[ALERT] {workflowName} - {type}',
                send: sendFn,
            });

            await provider.notify({
                ...baseEvent,
                type: 'failed',
            });

            expect(sendFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: '[ALERT] test-workflow - failed',
                }),
            );
        });
    });

    describe('slackProvider', () =>
    {
        it('should send POST request to webhook URL', async () =>
        {
            const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
                new Response('ok', { status: 200 })
            );

            const provider = slackProvider({
                webhookUrl: 'https://hooks.slack.com/services/xxx',
                channel: '#alerts',
            });

            await provider.notify({
                ...baseEvent,
                type: 'completed',
            });

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://hooks.slack.com/services/xxx',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                }),
            );

            const callBody = JSON.parse(
                (fetchSpy.mock.calls[0][1] as RequestInit).body as string
            );
            expect(callBody.channel).toBe('#alerts');
            expect(callBody.attachments[0].color).toBe('good');

            fetchSpy.mockRestore();
        });

        it('should use danger color for failed events', async () =>
        {
            const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
                new Response('ok', { status: 200 })
            );

            const provider = slackProvider({
                webhookUrl: 'https://hooks.slack.com/services/xxx',
            });

            await provider.notify({
                ...baseEvent,
                type: 'failed',
                error: 'Step failed',
            });

            const callBody = JSON.parse(
                (fetchSpy.mock.calls[0][1] as RequestInit).body as string
            );
            expect(callBody.attachments[0].color).toBe('danger');

            fetchSpy.mockRestore();
        });
    });
});
