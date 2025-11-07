/**
 * Plugin Discovery Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverPlugins, executePluginHooks } from '../plugin-discovery';
import type { ServerPlugin } from '../types';
import type { Hono } from 'hono';

describe('Plugin Discovery', () =>
{
    describe('discoverPlugins()', () =>
    {
        it('should return empty array when no package.json exists', async () =>
        {
            const plugins = await discoverPlugins('/non-existent-path');
            expect(plugins).toEqual([]);
        });

        it('should return empty array when no @spfn/* packages are installed', async () =>
        {
            // This test runs in the core package itself, which doesn't have @spfn/* deps
            const plugins = await discoverPlugins(process.cwd());
            expect(Array.isArray(plugins)).toBe(true);
        });

        it('should validate plugin structure', () =>
        {
            const validPlugin: ServerPlugin = {
                name: '@spfn/test',
                afterInfrastructure: async () => {},
            };

            expect(validPlugin.name).toBe('@spfn/test');
            expect(typeof validPlugin.afterInfrastructure).toBe('function');
        });

        it('should ignore packages without spfnPlugin export', async () =>
        {
            // When scanning dependencies, packages without plugin exports are silently skipped
            const plugins = await discoverPlugins(process.cwd());

            // All returned plugins should have a name
            plugins.forEach(plugin =>
            {
                expect(plugin.name).toBeDefined();
                expect(typeof plugin.name).toBe('string');
            });
        });
    });

    describe('executePluginHooks()', () =>
    {
        it('should execute hook for all plugins with that hook', async () =>
        {
            const calls: string[] = [];

            const plugin1: ServerPlugin = {
                name: 'plugin1',
                afterInfrastructure: async () =>
                {
                    calls.push('plugin1');
                },
            };

            const plugin2: ServerPlugin = {
                name: 'plugin2',
                afterInfrastructure: async () =>
                {
                    calls.push('plugin2');
                },
            };

            const plugins = [plugin1, plugin2];

            await executePluginHooks(plugins, 'afterInfrastructure');

            expect(calls).toEqual(['plugin1', 'plugin2']);
        });

        it('should execute hooks in order', async () =>
        {
            const executionOrder: string[] = [];

            const plugin1: ServerPlugin = {
                name: 'plugin1',
                beforeRoutes: async () =>
                {
                    executionOrder.push('plugin1-beforeRoutes');
                },
                afterRoutes: async () =>
                {
                    executionOrder.push('plugin1-afterRoutes');
                },
            };

            const plugin2: ServerPlugin = {
                name: 'plugin2',
                beforeRoutes: async () =>
                {
                    executionOrder.push('plugin2-beforeRoutes');
                },
                afterRoutes: async () =>
                {
                    executionOrder.push('plugin2-afterRoutes');
                },
            };

            const plugins = [plugin1, plugin2];

            await executePluginHooks(plugins, 'beforeRoutes', {} as Hono);
            await executePluginHooks(plugins, 'afterRoutes', {} as Hono);

            expect(executionOrder).toEqual([
                'plugin1-beforeRoutes',
                'plugin2-beforeRoutes',
                'plugin1-afterRoutes',
                'plugin2-afterRoutes',
            ]);
        });

        it('should skip plugins without the hook', async () =>
        {
            const calls: string[] = [];

            const plugin1: ServerPlugin = {
                name: 'plugin1',
                afterInfrastructure: async () =>
                {
                    calls.push('plugin1');
                },
            };

            const plugin2: ServerPlugin = {
                name: 'plugin2',
                // No afterInfrastructure hook
            };

            const plugin3: ServerPlugin = {
                name: 'plugin3',
                afterInfrastructure: async () =>
                {
                    calls.push('plugin3');
                },
            };

            const plugins = [plugin1, plugin2, plugin3];

            await executePluginHooks(plugins, 'afterInfrastructure');

            expect(calls).toEqual(['plugin1', 'plugin3']);
        });

        it('should throw error if hook fails', async () =>
        {
            const plugin: ServerPlugin = {
                name: 'failing-plugin',
                afterInfrastructure: async () =>
                {
                    throw new Error('Hook failed');
                },
            };

            await expect(
                executePluginHooks([plugin], 'afterInfrastructure')
            ).rejects.toThrow('Plugin failing-plugin failed in afterInfrastructure hook');
        });

        it('should stop execution if one plugin fails', async () =>
        {
            const calls: string[] = [];

            const plugin1: ServerPlugin = {
                name: 'plugin1',
                afterInfrastructure: async () =>
                {
                    calls.push('plugin1');
                },
            };

            const plugin2: ServerPlugin = {
                name: 'plugin2',
                afterInfrastructure: async () =>
                {
                    throw new Error('Plugin 2 failed');
                },
            };

            const plugin3: ServerPlugin = {
                name: 'plugin3',
                afterInfrastructure: async () =>
                {
                    calls.push('plugin3');
                },
            };

            const plugins = [plugin1, plugin2, plugin3];

            await expect(
                executePluginHooks(plugins, 'afterInfrastructure')
            ).rejects.toThrow();

            // Only plugin1 should have been called before the error
            expect(calls).toEqual(['plugin1']);
        });

        it('should pass arguments to hooks', async () =>
        {
            let receivedArg: any = null;

            const plugin: ServerPlugin = {
                name: 'test-plugin',
                beforeRoutes: async (app: Hono) =>
                {
                    receivedArg = app;
                },
            };

            const mockApp = { test: 'app' } as any;

            await executePluginHooks([plugin], 'beforeRoutes', mockApp);

            expect(receivedArg).toBe(mockApp);
        });
    });

    describe('Plugin Interface', () =>
    {
        it('should support all lifecycle hooks', () =>
        {
            const plugin: ServerPlugin = {
                name: '@spfn/test',
                afterInfrastructure: async () => {},
                beforeRoutes: async (app: Hono) => {},
                afterRoutes: async (app: Hono) => {},
                afterStart: async (instance: any) => {},
                beforeShutdown: async () => {},
            };

            expect(plugin.name).toBe('@spfn/test');
            expect(typeof plugin.afterInfrastructure).toBe('function');
            expect(typeof plugin.beforeRoutes).toBe('function');
            expect(typeof plugin.afterRoutes).toBe('function');
            expect(typeof plugin.afterStart).toBe('function');
            expect(typeof plugin.beforeShutdown).toBe('function');
        });

        it('should allow partial implementation of hooks', () =>
        {
            const plugin1: ServerPlugin = {
                name: '@spfn/plugin1',
                afterInfrastructure: async () => {},
            };

            const plugin2: ServerPlugin = {
                name: '@spfn/plugin2',
                beforeRoutes: async () => {},
                afterRoutes: async () => {},
            };

            const plugin3: ServerPlugin = {
                name: '@spfn/plugin3',
                afterStart: async () => {},
                beforeShutdown: async () => {},
            };

            expect(plugin1.afterInfrastructure).toBeDefined();
            expect(plugin1.beforeRoutes).toBeUndefined();

            expect(plugin2.beforeRoutes).toBeDefined();
            expect(plugin2.afterRoutes).toBeDefined();
            expect(plugin2.afterInfrastructure).toBeUndefined();

            expect(plugin3.afterStart).toBeDefined();
            expect(plugin3.beforeShutdown).toBeDefined();
            expect(plugin3.beforeRoutes).toBeUndefined();
        });
    });

    describe('Plugin Execution Context', () =>
    {
        it('should maintain execution context across hooks', async () =>
        {
            const state: string[] = [];

            const plugin: ServerPlugin = {
                name: 'stateful-plugin',
                afterInfrastructure: async () =>
                {
                    state.push('infrastructure');
                },
                beforeRoutes: async () =>
                {
                    state.push('before-routes');
                },
                afterRoutes: async () =>
                {
                    state.push('after-routes');
                },
                afterStart: async () =>
                {
                    state.push('start');
                },
            };

            await executePluginHooks([plugin], 'afterInfrastructure');
            await executePluginHooks([plugin], 'beforeRoutes');
            await executePluginHooks([plugin], 'afterRoutes');
            await executePluginHooks([plugin], 'afterStart');

            expect(state).toEqual([
                'infrastructure',
                'before-routes',
                'after-routes',
                'start',
            ]);
        });

        it('should handle async operations in hooks', async () =>
        {
            const delays: number[] = [];

            const plugin: ServerPlugin = {
                name: 'async-plugin',
                afterInfrastructure: async () =>
                {
                    const start = Date.now();
                    await new Promise(resolve => setTimeout(resolve, 10));
                    delays.push(Date.now() - start);
                },
            };

            await executePluginHooks([plugin], 'afterInfrastructure');

            expect(delays.length).toBe(1);
            expect(delays[0]).toBeGreaterThanOrEqual(10);
        });
    });

    describe('Error Handling', () =>
    {
        it('should include plugin name in error message', async () =>
        {
            const plugin: ServerPlugin = {
                name: '@spfn/error-plugin',
                afterInfrastructure: async () =>
                {
                    throw new Error('Something went wrong');
                },
            };

            await expect(
                executePluginHooks([plugin], 'afterInfrastructure')
            ).rejects.toThrow('@spfn/error-plugin');
        });

        it('should include hook name in error message', async () =>
        {
            const plugin: ServerPlugin = {
                name: 'test-plugin',
                beforeRoutes: async () =>
                {
                    throw new Error('Route error');
                },
            };

            await expect(
                executePluginHooks([plugin], 'beforeRoutes')
            ).rejects.toThrow('beforeRoutes');
        });

        it('should preserve original error message', async () =>
        {
            const originalError = 'Database connection failed';

            const plugin: ServerPlugin = {
                name: 'db-plugin',
                afterInfrastructure: async () =>
                {
                    throw new Error(originalError);
                },
            };

            await expect(
                executePluginHooks([plugin], 'afterInfrastructure')
            ).rejects.toThrow(originalError);
        });
    });
});