/**
 * Plugin Discovery System
 *
 * Automatically discovers and loads SPFN plugins from node_modules
 * Plugins export `spfnPlugin` to hook into server lifecycle
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../logger';
import type { ServerPlugin } from './types';

const pluginLogger = logger.child('@spfn/core:plugin');

/**
 * Discover SPFN plugins from installed packages
 *
 * Scans node_modules for @spfn/* packages that export spfnPlugin
 *
 * @example Package structure:
 * ```
 * @spfn/auth/
 *   package.json { "main": "./dist/index.js" }
 *   dist/
 *     index.js  -> exports { spfnPlugin }
 *     plugin.js
 * ```
 */
export async function discoverPlugins(cwd: string = process.cwd()): Promise<ServerPlugin[]>
{
    const plugins: ServerPlugin[] = [];
    const nodeModulesPath = join(cwd, 'node_modules');

    try
    {
        // Read project package.json to get dependencies
        const projectPkgPath = join(cwd, 'package.json');
        if (!existsSync(projectPkgPath))
        {
            pluginLogger.debug('No package.json found, skipping plugin discovery');
            return plugins;
        }

        const projectPkg = JSON.parse(readFileSync(projectPkgPath, 'utf-8'));

        const dependencies = {
            ...projectPkg.dependencies,
            ...projectPkg.devDependencies,
        };

        // Scan each @spfn/* package for plugin export
        for (const [packageName] of Object.entries(dependencies))
        {
            // Only scan @spfn/* packages
            if (!packageName.startsWith('@spfn/'))
            {
                continue;
            }

            try
            {
                const plugin = await loadPluginFromPackage(packageName, nodeModulesPath);
                if (plugin)
                {
                    plugins.push(plugin);
                    pluginLogger.info('Plugin discovered', {
                        name: plugin.name,
                        hooks: getPluginHookNames(plugin),
                    });
                }
            }
            catch (error)
            {
                pluginLogger.debug('Failed to load plugin', {
                    package: packageName,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    }
    catch (error)
    {
        pluginLogger.warn('Plugin discovery failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }

    return plugins;
}

async function loadPluginFromPackage(
    packageName: string,
    nodeModulesPath: string
): Promise<ServerPlugin | null>
{
    // Read package.json to get main entry point
    const pkgPath = join(nodeModulesPath, ...packageName.split('/'), 'package.json');

    if (!existsSync(pkgPath))
    {
        return null;
    }

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const packageDir = dirname(pkgPath);

    // Try to load plugin from main entry point
    const mainEntry = pkg.main || 'dist/index';
    const mainPath = join(packageDir, mainEntry);

    if (!existsSync(mainPath))
    {
        return null;
    }

    try
    {
        // Dynamic import from the main entry point
        const module = await import(mainPath);

        // Check if module exports spfnPlugin
        if (module.spfnPlugin && isValidPlugin(module.spfnPlugin))
        {
            return module.spfnPlugin;
        }

        return null;
    }
    catch (error)
    {
        // Silently fail - package may not have a plugin
        return null;
    }
}

function isValidPlugin(plugin: any): plugin is ServerPlugin
{
    return (
        plugin &&
        typeof plugin === 'object' &&
        typeof plugin.name === 'string' &&
        (
            typeof plugin.afterInfrastructure === 'function' ||
            typeof plugin.beforeRoutes === 'function' ||
            typeof plugin.afterRoutes === 'function' ||
            typeof plugin.afterStart === 'function' ||
            typeof plugin.beforeShutdown === 'function'
        )
    );
}

function getPluginHookNames(plugin: ServerPlugin): string[]
{
    const hooks: string[] = [];

    if (plugin.afterInfrastructure) hooks.push('afterInfrastructure');
    if (plugin.beforeRoutes) hooks.push('beforeRoutes');
    if (plugin.afterRoutes) hooks.push('afterRoutes');
    if (plugin.afterStart) hooks.push('afterStart');
    if (plugin.beforeShutdown) hooks.push('beforeShutdown');

    return hooks;
}

/**
 * Execute plugin hooks at specific lifecycle stage
 */
export async function executePluginHooks<T extends keyof ServerPlugin>(
    plugins: ServerPlugin[],
    hookName: T,
    ...args: any[]
): Promise<void>
{
    for (const plugin of plugins)
    {
        const hook = plugin[hookName];

        if (typeof hook === 'function')
        {
            try
            {
                pluginLogger.debug('Executing plugin hook', {
                    plugin: plugin.name,
                    hook: hookName,
                });

                await (hook as any)(...args);
            }
            catch (error)
            {
                pluginLogger.error('Plugin hook failed', {
                    plugin: plugin.name,
                    hook: hookName,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });

                // Re-throw to stop server initialization if critical hook fails
                throw new Error(
                    `Plugin ${plugin.name} failed in ${hookName} hook: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`
                );
            }
        }
    }
}