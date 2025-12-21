import { describe, it, expect, vi } from 'vitest';
import { consoleProvider, formatEventAsText } from '../providers';
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

    describe('formatEventAsText', () =>
    {
        it('should format basic event', () =>
        {
            const result = formatEventAsText(baseEvent);

            expect(result).toContain('Workflow: test-workflow');
            expect(result).toContain('Event: started');
            expect(result).toContain('Execution ID: exec-123');
            expect(result).toContain('Timestamp:');
        });

        it('should include step name when present', () =>
        {
            const result = formatEventAsText({
                ...baseEvent,
                type: 'step.started',
                stepName: 'create-repo',
            });

            expect(result).toContain('Step: create-repo');
        });

        it('should include error when present', () =>
        {
            const result = formatEventAsText({
                ...baseEvent,
                type: 'failed',
                error: 'Connection timeout',
            });

            expect(result).toContain('Error: Connection timeout');
        });
    });
});
