/**
 * Config Loader Tests
 *
 * Tests for codegen configuration loading from .spfnrc.json and package.json
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadCodegenConfig, createGeneratorsFromConfig } from '../config-loader.js';
import type { CodegenConfig } from '../config-loader.js';

// Mock fs module
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

// Mock logger
vi.mock('../../logger', () => ({
    logger: {
        child: vi.fn(() => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })),
    },
}));

describe('Config Loader', () =>
{
    const mockCwd = '/test/project';

    beforeEach(() =>
    {
        vi.clearAllMocks();
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    describe('loadCodegenConfig', () =>
    {
        it('should load config from .spfnrc.json', async () =>
        {
            const { existsSync, readFileSync } = await import('fs');

            const mockConfig: CodegenConfig = {
                generators: [
                    { name: '@spfn/core:contract', enabled: true }
                ]
            };

            vi.mocked(existsSync).mockImplementation((path) =>
            {
                return path === '/test/project/.spfnrc.json';
            });

            vi.mocked(readFileSync).mockImplementation((path) =>
            {
                if (path === '/test/project/.spfnrc.json')
                {
                    return JSON.stringify({ codegen: mockConfig });
                }
                return '';
            });

            const config = loadCodegenConfig(mockCwd);

            expect(config).toEqual(mockConfig);
            expect(existsSync).toHaveBeenCalledWith('/test/project/.spfnrc.json');
        });

        it('should load config from package.json if .spfnrc.json not found', async () =>
        {
            const { existsSync, readFileSync } = await import('fs');

            const mockConfig: CodegenConfig = {
                generators: [
                    { name: '@spfn/core:contract', enabled: true }
                ]
            };

            vi.mocked(existsSync).mockImplementation((path) =>
            {
                return path === '/test/project/package.json';
            });

            vi.mocked(readFileSync).mockImplementation((path) =>
            {
                if (path === '/test/project/package.json')
                {
                    return JSON.stringify({
                        name: 'test-project',
                        spfn: {
                            codegen: mockConfig
                        }
                    });
                }
                return '';
            });

            const config = loadCodegenConfig(mockCwd);

            expect(config).toEqual(mockConfig);
            expect(existsSync).toHaveBeenCalledWith('/test/project/.spfnrc.json');
            expect(existsSync).toHaveBeenCalledWith('/test/project/package.json');
        });

        it('should return default config if no config file found', async () =>
        {
            const { existsSync } = await import('fs');

            vi.mocked(existsSync).mockReturnValue(false);

            const config = loadCodegenConfig(mockCwd);

            expect(config).toEqual({
                generators: [
                    { name: '@spfn/core:contract', enabled: true }
                ]
            });
        });

        it('should handle invalid JSON in .spfnrc.json', async () =>
        {
            const { existsSync, readFileSync } = await import('fs');

            vi.mocked(existsSync).mockImplementation((path) =>
            {
                return path === '/test/project/.spfnrc.json' || path === '/test/project/package.json';
            });

            vi.mocked(readFileSync).mockImplementation((path) =>
            {
                if (path === '/test/project/.spfnrc.json')
                {
                    return 'invalid json';
                }
                if (path === '/test/project/package.json')
                {
                    return JSON.stringify({
                        name: 'test-project',
                        spfn: {
                            codegen: {
                                generators: [{ name: '@spfn/core:contract' }]
                            }
                        }
                    });
                }
                return '';
            });

            const config = loadCodegenConfig(mockCwd);

            // Should fallback to package.json
            expect(config).toEqual({
                generators: [{ name: '@spfn/core:contract' }]
            });
        });

        it('should handle .spfnrc.json without codegen field', async () =>
        {
            const { existsSync, readFileSync } = await import('fs');

            vi.mocked(existsSync).mockImplementation((path) =>
            {
                return path === '/test/project/.spfnrc.json' || path === '/test/project/package.json';
            });

            vi.mocked(readFileSync).mockImplementation((path) =>
            {
                if (path === '/test/project/.spfnrc.json')
                {
                    return JSON.stringify({ other: 'config' });
                }
                if (path === '/test/project/package.json')
                {
                    return JSON.stringify({
                        name: 'test-project',
                        spfn: {
                            codegen: {
                                generators: [{ name: '@spfn/core:contract' }]
                            }
                        }
                    });
                }
                return '';
            });

            const config = loadCodegenConfig(mockCwd);

            // Should fallback to package.json
            expect(config).toEqual({
                generators: [{ name: '@spfn/core:contract' }]
            });
        });

        it('should handle package.json without spfn.codegen field', async () =>
        {
            const { existsSync, readFileSync } = await import('fs');

            vi.mocked(existsSync).mockImplementation((path) =>
            {
                return path === '/test/project/package.json';
            });

            vi.mocked(readFileSync).mockImplementation((path) =>
            {
                if (path === '/test/project/package.json')
                {
                    return JSON.stringify({
                        name: 'test-project',
                        version: '1.0.0'
                    });
                }
                return '';
            });

            const config = loadCodegenConfig(mockCwd);

            // Should return default config
            expect(config).toEqual({
                generators: [
                    { name: '@spfn/core:contract', enabled: true }
                ]
            });
        });
    });

    describe('createGeneratorsFromConfig', () =>
    {
        it('should return empty array for empty config', async () =>
        {
            const config: CodegenConfig = {};
            const generators = await createGeneratorsFromConfig(config, mockCwd);

            expect(generators).toEqual([]);
        });

        it('should return empty array for config with no generators', async () =>
        {
            const config: CodegenConfig = {
                generators: []
            };
            const generators = await createGeneratorsFromConfig(config, mockCwd);

            expect(generators).toEqual([]);
        });

        it('should skip disabled generators', async () =>
        {
            const config: CodegenConfig = {
                generators: [
                    { name: '@spfn/core:contract', enabled: false }
                ]
            };

            const generators = await createGeneratorsFromConfig(config, mockCwd);

            expect(generators).toEqual([]);
        });

        it('should warn on invalid generator name format', async () =>
        {
            const config: CodegenConfig = {
                generators: [
                    { name: 'invalid-name-without-colon' }
                ]
            };

            const generators = await createGeneratorsFromConfig(config, mockCwd);

            expect(generators).toEqual([]);
            // Warning should be logged (tested via logger mock)
        });

        it('should handle generator loading errors gracefully', async () =>
        {
            const config: CodegenConfig = {
                generators: [
                    { name: '@non-existent/package:generator' }
                ]
            };

            const generators = await createGeneratorsFromConfig(config, mockCwd);

            // Should return empty array, not throw
            expect(generators).toEqual([]);
        });

        it('should handle custom generator path errors gracefully', async () =>
        {
            const config: CodegenConfig = {
                generators: [
                    { path: './non-existent-generator.ts' }
                ]
            };

            const generators = await createGeneratorsFromConfig(config, mockCwd);

            // Should return empty array, not throw
            expect(generators).toEqual([]);
        });

        it('should handle invalid custom generator (not a function)', async () =>
        {
            const config: CodegenConfig = {
                generators: [
                    { path: './invalid-generator.ts' }
                ]
            };

            // Mock jiti to return non-function
            vi.doMock('jiti', () => ({
                createJiti: vi.fn(() => vi.fn(() => ({
                    default: { invalid: 'not-a-function' }
                })))
            }));

            const generators = await createGeneratorsFromConfig(config, mockCwd);

            expect(generators).toEqual([]);
        });
    });

    describe('edge cases', () =>
    {
        it('should handle file read errors gracefully', async () =>
        {
            const { existsSync, readFileSync } = await import('fs');

            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockImplementation(() =>
            {
                throw new Error('Permission denied');
            });

            const config = loadCodegenConfig(mockCwd);

            // Should return default config
            expect(config).toEqual({
                generators: [
                    { name: '@spfn/core:contract', enabled: true }
                ]
            });
        });

        it('should handle multiple generator configs', async () =>
        {
            const { existsSync, readFileSync } = await import('fs');

            const mockConfig: CodegenConfig = {
                generators: [
                    { name: '@spfn/core:contract', enabled: true },
                    { name: '@spfn/core:openapi', enabled: false },
                    { path: './custom-generator.ts' }
                ]
            };

            vi.mocked(existsSync).mockImplementation((path) =>
            {
                return path === '/test/project/.spfnrc.json';
            });

            vi.mocked(readFileSync).mockImplementation((path) =>
            {
                if (path === '/test/project/.spfnrc.json')
                {
                    return JSON.stringify({ codegen: mockConfig });
                }
                return '';
            });

            const config = loadCodegenConfig(mockCwd);

            expect(config).toEqual(mockConfig);
            expect(config.generators).toHaveLength(3);
        });
    });
});