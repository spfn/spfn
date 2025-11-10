/**
 * Server Banner Tests
 *
 * Tests for server startup banner printing functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { printBanner } from '../banner';

describe('Server Banner', () => {
    let consoleLogSpy: MockInstance;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('printBanner()', () => {
        it('should print SPFN banner with development mode', () => {
            printBanner({
                mode: 'Development',
                host: 'localhost',
                port: 4000,
            });

            expect(consoleLogSpy).toHaveBeenCalled();

            // Check that banner info was printed
            const calls = consoleLogSpy.mock.calls.map(call => call[0]);
            const output = calls.join('\n');

            // Check ASCII art is present
            expect(output).toContain('_____ ____  ______ _   _');
            expect(output).toContain('Mode: Development');
            expect(output).toContain('http://localhost:4000');
        });

        it('should print banner with production mode', () => {
            printBanner({
                mode: 'Production',
                host: 'localhost',
                port: 3000,
            });

            expect(consoleLogSpy).toHaveBeenCalled();

            const calls = consoleLogSpy.mock.calls.map(call => call[0]);
            const output = calls.join('\n');

            expect(output).toContain('Mode: Production');
            expect(output).toContain('http://localhost:3000');
        });

        it('should show local and network addresses when host is 0.0.0.0', () => {
            printBanner({
                mode: 'Development',
                host: '0.0.0.0',
                port: 4000,
            });

            expect(consoleLogSpy).toHaveBeenCalled();

            const calls = consoleLogSpy.mock.calls.map(call => call[0]);
            const output = calls.join('\n');

            // Should show localhost instead of 0.0.0.0
            expect(output).toContain('http://localhost:4000');
            expect(output).toContain('Local:');
        });

        it('should handle custom host addresses', () => {
            printBanner({
                mode: 'Development',
                host: '192.168.1.100',
                port: 8080,
            });

            expect(consoleLogSpy).toHaveBeenCalled();

            const calls = consoleLogSpy.mock.calls.map(call => call[0]);
            const output = calls.join('\n');

            expect(output).toContain('http://192.168.1.100:8080');
        });

        it('should handle different port numbers', () => {
            const testPorts = [3000, 4000, 5000, 8000, 8080];

            for (const port of testPorts) {
                consoleLogSpy.mockClear();

                printBanner({
                    mode: 'Development',
                    host: 'localhost',
                    port,
                });

                const calls = consoleLogSpy.mock.calls.map(call => call[0]);
                const output = calls.join('\n');

                expect(output).toContain(`http://localhost:${port}`);
            }
        });

        it('should print empty lines for formatting', () => {
            printBanner({
                mode: 'Development',
                host: 'localhost',
                port: 4000,
            });

            const calls = consoleLogSpy.mock.calls.map(call => call[0]);

            // Should have empty lines at start and end for better readability
            expect(calls[0]).toBe('');
            expect(calls[calls.length - 1]).toBe('');
        });

        it('should print complete SPFN ASCII logo', () => {
            printBanner({
                mode: 'Development',
                host: 'localhost',
                port: 4000,
            });

            const calls = consoleLogSpy.mock.calls.map(call => call[0]);
            const output = calls.join('\n');

            // Check all parts of the ASCII logo are present
            expect(output).toContain('_____ ____  ______ _   _');
            expect(output).toContain('/ ____|  _ \\|  ____| \\ | |');
            expect(output).toContain('| (___ | |_) | |__  |  \\| |');
            expect(output).toContain('\\___ \\|  __/|  __| | . ` |');
            expect(output).toContain('____) | |   | |    | |\\  |');
            expect(output).toContain('|_____/|_|   |_|    |_| \\_|');
        });

        it('should format URLs with proper protocol', () => {
            printBanner({
                mode: 'Development',
                host: 'localhost',
                port: 4000,
            });

            const calls = consoleLogSpy.mock.calls.map(call => call[0]);
            const output = calls.join('\n');

            // URLs should start with http://
            expect(output).toMatch(/http:\/\/localhost:4000/);
        });

        it('should display triangle symbol (▲) for URLs', () => {
            printBanner({
                mode: 'Development',
                host: 'localhost',
                port: 4000,
            });

            const calls = consoleLogSpy.mock.calls.map(call => call[0]);
            const output = calls.join('\n');

            // Should use triangle symbol like Next.js
            expect(output).toContain('▲');
        });
    });
});