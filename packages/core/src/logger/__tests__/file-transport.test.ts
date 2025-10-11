/**
 * File Transport Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileTransport } from '../transports/file';
import type { LogMetadata } from '../types';
import { existsSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

describe('FileTransport', () =>
{
    const testLogDir = join(process.cwd(), 'test-logs');

    beforeEach(() =>
    {
        // Clean up test directory before each test
        if (existsSync(testLogDir))
        {
            rmSync(testLogDir, { recursive: true });
        }
    });

    afterEach(() =>
    {
        // Clean up test directory after each test
        if (existsSync(testLogDir))
        {
            rmSync(testLogDir, { recursive: true });
        }
    });

    describe('Directory Creation', () =>
    {
        it('should create log directory if not exists', () =>
        {
            expect(existsSync(testLogDir)).toBe(false);

            new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            expect(existsSync(testLogDir)).toBe(true);
        });

        it('should not throw if log directory already exists', () =>
        {
            mkdirSync(testLogDir, { recursive: true });

            expect(() =>
            {
                new FileTransport({
                    level: 'info',
                    enabled: true,
                    logDir: testLogDir,
                });
            }).not.toThrow();
        });
    });

    describe('Basic Logging', () =>
    {
        it('should write log to file', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            const metadata: LogMetadata = {
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'info',
                message: 'Test message',
            };

            await transport.log(metadata);

            const files = readdirSync(testLogDir);
            expect(files.length).toBe(1);
            expect(files[0]).toBe('2024-01-15.log');

            const content = readFileSync(join(testLogDir, files[0]), 'utf-8');
            expect(content).toContain('Test message');
        });

        it('should not write when disabled', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: false,
                logDir: testLogDir,
            });

            await transport.log({
                timestamp: new Date(),
                level: 'info',
                message: 'Test message',
            });

            const files = readdirSync(testLogDir);
            expect(files.length).toBe(0);
        });
    });

    describe('Log Level Filtering', () =>
    {
        it('should filter logs below minimum level', async () =>
        {
            const transport = new FileTransport({
                level: 'warn',
                enabled: true,
                logDir: testLogDir,
            });

            await transport.log({
                timestamp: new Date(),
                level: 'debug',
                message: 'Debug message',
            });

            await transport.log({
                timestamp: new Date(),
                level: 'info',
                message: 'Info message',
            });

            const files = readdirSync(testLogDir);
            expect(files.length).toBe(0);
        });

        it('should log at or above minimum level', async () =>
        {
            const transport = new FileTransport({
                level: 'warn',
                enabled: true,
                logDir: testLogDir,
            });

            await transport.log({
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'warn',
                message: 'Warn message',
            });

            await transport.log({
                timestamp: new Date('2024-01-15T10:31:00.000Z'),
                level: 'error',
                message: 'Error message',
            });

            const files = readdirSync(testLogDir);
            expect(files.length).toBe(1);

            const content = readFileSync(join(testLogDir, files[0]), 'utf-8');
            expect(content).toContain('Warn message');
            expect(content).toContain('Error message');
        });
    });

    describe('File Naming', () =>
    {
        it('should create file with date-based name (YYYY-MM-DD.log)', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            await transport.log({
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'info',
                message: 'Test message',
            });

            const files = readdirSync(testLogDir);
            expect(files[0]).toBe('2024-01-15.log');
        });

        it('should append to existing file on same day', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            const sameDay = new Date('2024-01-15T10:30:00.000Z');

            await transport.log({
                timestamp: sameDay,
                level: 'info',
                message: 'First message',
            });

            await transport.log({
                timestamp: sameDay,
                level: 'info',
                message: 'Second message',
            });

            const files = readdirSync(testLogDir);
            expect(files.length).toBe(1);

            const content = readFileSync(join(testLogDir, files[0]), 'utf-8');
            const lines = content.trim().split('\n');
            expect(lines.length).toBe(2);
        });

        it('should create separate files for different days', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            await transport.log({
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'info',
                message: 'Day 1 message',
            });

            await transport.log({
                timestamp: new Date('2024-01-16T10:30:00.000Z'),
                level: 'info',
                message: 'Day 2 message',
            });

            const files = readdirSync(testLogDir);
            expect(files.length).toBe(2);
            expect(files).toContain('2024-01-15.log');
            expect(files).toContain('2024-01-16.log');
        });
    });

    describe('JSON Format', () =>
    {
        it('should write in JSON format', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            await transport.log({
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'info',
                message: 'Test message',
            });

            const files = readdirSync(testLogDir);
            const content = readFileSync(join(testLogDir, files[0]), 'utf-8');
            const line = content.trim();

            expect(() => JSON.parse(line)).not.toThrow();

            const parsed = JSON.parse(line);
            expect(parsed.level).toBe('info');
            expect(parsed.message).toBe('Test message');
            expect(parsed.timestamp).toBe('2024-01-15T10:30:00.000Z');
        });

        it('should include module in JSON', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            await transport.log({
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'info',
                message: 'Test message',
                module: 'database',
            });

            const files = readdirSync(testLogDir);
            const content = readFileSync(join(testLogDir, files[0]), 'utf-8');
            const parsed = JSON.parse(content.trim());

            expect(parsed.module).toBe('database');
        });

        it('should include context in JSON', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            await transport.log({
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'info',
                message: 'Test message',
                context: { userId: 123, action: 'login' },
            });

            const files = readdirSync(testLogDir);
            const content = readFileSync(join(testLogDir, files[0]), 'utf-8');
            const parsed = JSON.parse(content.trim());

            expect(parsed.context).toEqual({ userId: 123, action: 'login' });
        });

        it('should include error details in JSON', async () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            const error = new Error('Test error');

            await transport.log({
                timestamp: new Date('2024-01-15T10:30:00.000Z'),
                level: 'error',
                message: 'Error occurred',
                error,
            });

            const files = readdirSync(testLogDir);
            const content = readFileSync(join(testLogDir, files[0]), 'utf-8');
            const parsed = JSON.parse(content.trim());

            expect(parsed.error).toBeDefined();
            expect(parsed.error.name).toBe('Error');
            expect(parsed.error.message).toBe('Test error');
            expect(parsed.error.stack).toBeDefined();
        });
    });

    describe('Properties', () =>
    {
        it('should have correct transport name', () =>
        {
            const transport = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            expect(transport.name).toBe('file');
        });

        it('should store level correctly', () =>
        {
            const transport = new FileTransport({
                level: 'warn',
                enabled: true,
                logDir: testLogDir,
            });

            expect(transport.level).toBe('warn');
        });

        it('should store enabled state correctly', () =>
        {
            const transportEnabled = new FileTransport({
                level: 'info',
                enabled: true,
                logDir: testLogDir,
            });

            const transportDisabled = new FileTransport({
                level: 'info',
                enabled: false,
                logDir: testLogDir,
            });

            expect(transportEnabled.enabled).toBe(true);
            expect(transportDisabled.enabled).toBe(false);
        });
    });
});