/**
 * Formatters Tests
 */

import { describe, it, expect } from 'vitest';
import {
    colorizeLevel,
    formatTimestamp,
    formatTimestampHuman,
    formatError,
    formatContext,
    formatConsole,
    formatJSON,
    formatSlack,
    formatEmailSubject,
    formatEmailBody,
} from '../formatters';
import type { LogMetadata } from '../types';

describe('Formatters', () =>
{
    describe('colorizeLevel', () =>
    {
        it('should colorize debug level', () =>
        {
            const result = colorizeLevel('debug');
            expect(result).toContain('DEBUG');
            expect(result).toContain('\x1b['); // ANSI color code
        });

        it('should colorize all log levels', () =>
        {
            const levels = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

            levels.forEach(level =>
            {
                const result = colorizeLevel(level);
                expect(result).toContain(level.toUpperCase());
                expect(result).toContain('\x1b[');
            });
        });

        it('should pad level names to 5 characters', () =>
        {
            const result = colorizeLevel('info');
            // Remove ANSI codes and check length
            const stripped = result.replace(/\x1b\[\d+m/g, '');
            expect(stripped.length).toBe(5);
        });
    });

    describe('formatTimestamp', () =>
    {
        it('should format timestamp in ISO 8601 format', () =>
        {
            const date = new Date('2024-01-15T10:30:00.000Z');
            const result = formatTimestamp(date);

            expect(result).toBe('2024-01-15T10:30:00.000Z');
        });

        it('should handle different dates', () =>
        {
            const date1 = new Date('2023-12-25T12:00:00.000Z');
            const date2 = new Date('2025-06-15T18:45:30.123Z');

            expect(formatTimestamp(date1)).toBe('2023-12-25T12:00:00.000Z');
            expect(formatTimestamp(date2)).toBe('2025-06-15T18:45:30.123Z');
        });
    });

    describe('formatTimestampHuman', () =>
    {
        it('should format timestamp in human-readable format', () =>
        {
            const date = new Date('2024-01-15T10:30:45.123Z');
            const result = formatTimestampHuman(date);

            expect(result).toContain('2024-01-15');
            expect(result).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
        });

        it('should pad single digits', () =>
        {
            const date = new Date('2024-01-05T09:05:03.001Z');
            const result = formatTimestampHuman(date);

            expect(result).toContain('2024-01-05');
            expect(result).toContain('001'); // milliseconds padded
        });
    });

    describe('formatError', () =>
    {
        it('should format error with name and message', () =>
        {
            const error = new Error('Test error message');
            const result = formatError(error);

            expect(result).toContain('Error: Test error message');
        });

        it('should include stack trace', () =>
        {
            const error = new Error('Test error');
            const result = formatError(error);

            expect(result).toContain('at ');
        });

        it('should handle custom error types', () =>
        {
            class CustomError extends Error
            {
                constructor(message: string)
                {
                    super(message);
                    this.name = 'CustomError';
                }
            }

            const error = new CustomError('Custom error message');
            const result = formatError(error);

            expect(result).toContain('CustomError: Custom error message');
        });
    });

    describe('formatContext', () =>
    {
        it('should format context as JSON', () =>
        {
            const context = { userId: 123, action: 'login' };
            const result = formatContext(context);

            const parsed = JSON.parse(result);
            expect(parsed).toEqual(context);
        });

        it('should pretty print with 2-space indentation', () =>
        {
            const context = { userId: 123, nested: { key: 'value' } };
            const result = formatContext(context);

            expect(result).toContain('  '); // 2-space indent
            expect(result).toContain('{\n');
        });

        it('should handle serialization errors gracefully', () =>
        {
            const circular: any = {};
            circular.self = circular;

            const result = formatContext(circular);

            expect(result).toBe('[Context serialization failed]');
        });
    });

    describe('formatConsole', () =>
    {
        it('should format complete log message', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'info',
                message: 'Test message',
            };

            const result = formatConsole(metadata, false);

            expect(result).toContain('INFO');
            expect(result).toContain('Test message');
            expect(result).toContain('2024-01-15');
        });

        it('should include module name', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'info',
                message: 'Test message',
                module: 'database',
            };

            const result = formatConsole(metadata, false);

            expect(result).toContain('[database]');
        });

        it('should include context', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'info',
                message: 'Test message',
                context: { userId: 123 },
            };

            const result = formatConsole(metadata, false);

            expect(result).toContain('userId');
            expect(result).toContain('123');
        });

        it('should include error stack trace', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'error',
                message: 'Error occurred',
                error: new Error('Test error'),
            };

            const result = formatConsole(metadata, false);

            expect(result).toContain('Test error');
            expect(result).toContain('at ');
        });

        it('should apply colors when colorize is true', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'info',
                message: 'Test message',
            };

            const result = formatConsole(metadata, true);

            expect(result).toContain('\x1b[');
        });

        it('should not apply colors when colorize is false', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'info',
                message: 'Test message',
            };

            const result = formatConsole(metadata, false);

            expect(result).not.toContain('\x1b[');
        });
    });

    describe('formatJSON', () =>
    {
        it('should format as valid JSON', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'info',
                message: 'Test message',
            };

            const result = formatJSON(metadata);
            const parsed = JSON.parse(result);

            expect(parsed.timestamp).toBe('2024-01-15T10:30:00.000Z');
            expect(parsed.level).toBe('info');
            expect(parsed.message).toBe('Test message');
        });

        it('should include module if provided', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'info',
                message: 'Test message',
                module: 'database',
            };

            const result = formatJSON(metadata);
            const parsed = JSON.parse(result);

            expect(parsed.module).toBe('database');
        });

        it('should include context if provided', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'info',
                message: 'Test message',
                context: { userId: 123, action: 'login' },
            };

            const result = formatJSON(metadata);
            const parsed = JSON.parse(result);

            expect(parsed.context).toEqual({ userId: 123, action: 'login' });
        });

        it('should include error details if provided', () =>
        {
            const error = new Error('Test error');
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'error',
                message: 'Error occurred',
                error,
            };

            const result = formatJSON(metadata);
            const parsed = JSON.parse(result);

            expect(parsed.error).toBeDefined();
            expect(parsed.error.name).toBe('Error');
            expect(parsed.error.message).toBe('Test error');
            expect(parsed.error.stack).toBeDefined();
        });
    });

    describe('formatSlack', () =>
    {
        it('should format message with emoji', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'error',
                message: 'Error occurred',
            };

            const result = formatSlack(metadata);

            expect(result).toContain(':x:');
            expect(result).toContain('*ERROR*');
            expect(result).toContain('Error occurred');
        });

        it('should include module in backticks', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'warn',
                message: 'Warning message',
                module: 'database',
            };

            const result = formatSlack(metadata);

            expect(result).toContain('`[database]`');
        });

        it('should format context in code block', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'info',
                message: 'Info message',
                context: { userId: 123 },
            };

            const result = formatSlack(metadata);

            expect(result).toContain('```');
            expect(result).toContain('userId');
        });

        it('should format error in code block', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'error',
                message: 'Error occurred',
                error: new Error('Test error'),
            };

            const result = formatSlack(metadata);

            expect(result).toContain('```');
            expect(result).toContain('Test error');
        });
    });

    describe('formatEmailSubject', () =>
    {
        it('should format email subject with level and message', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'error',
                message: 'Database connection failed',
            };

            const result = formatEmailSubject(metadata);

            expect(result).toContain('[ERROR]');
            expect(result).toContain('Database connection failed');
        });

        it('should include module in subject', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'fatal',
                message: 'Critical error',
                module: 'payment',
            };

            const result = formatEmailSubject(metadata);

            expect(result).toContain('[FATAL]');
            expect(result).toContain('[payment]');
            expect(result).toContain('Critical error');
        });
    });

    describe('formatEmailBody', () =>
    {
        it('should format email body as HTML', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'error',
                message: 'Test error',
            };

            const result = formatEmailBody(metadata);

            expect(result).toContain('<html>');
            expect(result).toContain('</html>');
            expect(result).toContain('ERROR');
            expect(result).toContain('Test error');
        });

        it('should include module section', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'error',
                message: 'Test error',
                module: 'database',
            };

            const result = formatEmailBody(metadata);

            expect(result).toContain('<strong>Module:</strong>');
            expect(result).toContain('database');
        });

        it('should include context section', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'error',
                message: 'Test error',
                context: { userId: 123 },
            };

            const result = formatEmailBody(metadata);

            expect(result).toContain('Context');
            expect(result).toContain('userId');
        });

        it('should include error stack trace section', () =>
        {
            const metadata: LogMetadata = {
                timestamp: new Date(),
                level: 'error',
                message: 'Test error',
                error: new Error('Stack trace error'),
            };

            const result = formatEmailBody(metadata);

            expect(result).toContain('Error Stack Trace');
            expect(result).toContain('Stack trace error');
        });
    });
});
