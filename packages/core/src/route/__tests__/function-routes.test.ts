/**
 * Function Routes Discovery Tests
 *
 * Tests for discoverFunctionRoutes() - automatic SPFN package route discovery
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { discoverFunctionRoutes } from '../function-routes';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_PROJECT_DIR = join(process.cwd(), '__test_function_routes__');

describe('discoverFunctionRoutes()', () => {
    beforeAll(() => {
        // Create test project structure
        if (!existsSync(TEST_PROJECT_DIR)) {
            mkdirSync(TEST_PROJECT_DIR, { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up test directory
        if (existsSync(TEST_PROJECT_DIR)) {
            rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
        }
    });

    describe('Package Discovery', () => {
        it('should discover SPFN packages with routes', () => {
            // Create test project with dependencies
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const spfnCmsDir = join(nodeModulesDir, '@spfn', 'cms');
            mkdirSync(spfnCmsDir, { recursive: true });

            // Create project package.json
            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        '@spfn/cms': '^1.0.0',
                    },
                })
            );

            // Create SPFN package with routes
            writeFileSync(
                join(spfnCmsDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/cms',
                    version: '1.0.0',
                    spfn: {
                        routes: {
                            dir: './dist/routes',
                        },
                    },
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions.length).toBe(1);
            expect(functions[0].packageName).toBe('@spfn/cms');
            expect(functions[0].routesDir).toBe(join(spfnCmsDir, 'dist', 'routes'));
            expect(functions[0].packagePath).toBe(spfnCmsDir);

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });

        it('should discover packages with prefix', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const spfnAuthDir = join(nodeModulesDir, '@spfn', 'auth');
            mkdirSync(spfnAuthDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        '@spfn/auth': '^1.0.0',
                    },
                })
            );

            writeFileSync(
                join(spfnAuthDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/auth',
                    version: '1.0.0',
                    spfn: {
                        routes: {
                            dir: './dist/routes',
                        },
                        prefix: '/auth',
                    },
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions.length).toBe(1);
            expect(functions[0].packageName).toBe('@spfn/auth');
            expect(functions[0].prefix).toBe('/auth');

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });

        it('should discover multiple SPFN packages', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const spfnCmsDir = join(nodeModulesDir, '@spfn', 'cms');
            const spfnAuthDir = join(nodeModulesDir, '@spfn', 'auth');
            mkdirSync(spfnCmsDir, { recursive: true });
            mkdirSync(spfnAuthDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        '@spfn/cms': '^1.0.0',
                        '@spfn/auth': '^1.0.0',
                    },
                })
            );

            writeFileSync(
                join(spfnCmsDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/cms',
                    spfn: { routes: { dir: './dist/routes' } },
                })
            );

            writeFileSync(
                join(spfnAuthDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/auth',
                    spfn: { routes: { dir: './dist/routes' }, prefix: '/auth' },
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions.length).toBe(2);
            expect(functions.map((f) => f.packageName).sort()).toEqual(['@spfn/auth', '@spfn/cms']);

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });

        it('should discover packages with spfn- prefix', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const customPackageDir = join(nodeModulesDir, 'spfn-analytics');
            mkdirSync(customPackageDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        'spfn-analytics': '^1.0.0',
                    },
                })
            );

            writeFileSync(
                join(customPackageDir, 'package.json'),
                JSON.stringify({
                    name: 'spfn-analytics',
                    spfn: { routes: { dir: './routes' } },
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions.length).toBe(1);
            expect(functions[0].packageName).toBe('spfn-analytics');

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });
    });

    describe('Filtering', () => {
        it('should ignore non-SPFN packages', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const lodashDir = join(nodeModulesDir, 'lodash');
            mkdirSync(lodashDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        lodash: '^4.0.0',
                    },
                })
            );

            writeFileSync(
                join(lodashDir, 'package.json'),
                JSON.stringify({
                    name: 'lodash',
                    version: '4.0.0',
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions.length).toBe(0);

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });

        it('should ignore SPFN packages without routes config', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const spfnUtilsDir = join(nodeModulesDir, '@spfn', 'utils');
            mkdirSync(spfnUtilsDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        '@spfn/utils': '^1.0.0',
                    },
                })
            );

            writeFileSync(
                join(spfnUtilsDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/utils',
                    version: '1.0.0',
                    // No spfn.routes config
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions.length).toBe(0);

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });
    });

    describe('Error Handling', () => {
        it('should handle missing package.json gracefully', () => {
            const tempDir = join(process.cwd(), '__test_no_pkg__');
            mkdirSync(tempDir, { recursive: true });

            const functions = discoverFunctionRoutes(tempDir);

            expect(functions).toEqual([]);

            rmSync(tempDir, { recursive: true });
        });

        it('should handle missing node_modules gracefully', () => {
            const tempDir = join(process.cwd(), '__test_no_modules__');
            mkdirSync(tempDir, { recursive: true });

            writeFileSync(
                join(tempDir, 'package.json'),
                JSON.stringify({
                    name: 'test',
                    dependencies: {
                        '@spfn/cms': '^1.0.0',
                    },
                })
            );

            const functions = discoverFunctionRoutes(tempDir);

            expect(functions).toEqual([]);

            rmSync(tempDir, { recursive: true });
        });

        it('should skip packages that cannot be read', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const spfnCmsDir = join(nodeModulesDir, '@spfn', 'cms');
            mkdirSync(spfnCmsDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        '@spfn/cms': '^1.0.0',
                        '@spfn/missing': '^1.0.0', // This package doesn't exist
                    },
                })
            );

            writeFileSync(
                join(spfnCmsDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/cms',
                    spfn: { routes: { dir: './routes' } },
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            // Should still discover @spfn/cms, skip @spfn/missing
            expect(functions.length).toBe(1);
            expect(functions[0].packageName).toBe('@spfn/cms');

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });

        it('should handle empty dependencies', () => {
            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {},
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions).toEqual([]);

            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
        });

        it('should handle devDependencies', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const spfnDevDir = join(nodeModulesDir, '@spfn', 'dev-tools');
            mkdirSync(spfnDevDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    devDependencies: {
                        '@spfn/dev-tools': '^1.0.0',
                    },
                })
            );

            writeFileSync(
                join(spfnDevDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/dev-tools',
                    spfn: { routes: { dir: './routes' } },
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions.length).toBe(1);
            expect(functions[0].packageName).toBe('@spfn/dev-tools');

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });
    });

    describe('Return Value', () => {
        it('should return FunctionRouteInfo with all fields', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const spfnCmsDir = join(nodeModulesDir, '@spfn', 'cms');
            mkdirSync(spfnCmsDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        '@spfn/cms': '^1.0.0',
                    },
                })
            );

            writeFileSync(
                join(spfnCmsDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/cms',
                    spfn: {
                        routes: { dir: './dist/routes' },
                        prefix: '/cms',
                    },
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions[0]).toMatchObject({
                packageName: '@spfn/cms',
                routesDir: join(spfnCmsDir, 'dist', 'routes'),
                packagePath: spfnCmsDir,
                prefix: '/cms',
            });

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });

        it('should handle missing prefix (undefined)', () => {
            const nodeModulesDir = join(TEST_PROJECT_DIR, 'node_modules');
            const spfnCoreDir = join(nodeModulesDir, '@spfn', 'core');
            mkdirSync(spfnCoreDir, { recursive: true });

            writeFileSync(
                join(TEST_PROJECT_DIR, 'package.json'),
                JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        '@spfn/core': '^1.0.0',
                    },
                })
            );

            writeFileSync(
                join(spfnCoreDir, 'package.json'),
                JSON.stringify({
                    name: '@spfn/core',
                    spfn: {
                        routes: { dir: './routes' },
                        // No prefix
                    },
                })
            );

            const functions = discoverFunctionRoutes(TEST_PROJECT_DIR);

            expect(functions[0].prefix).toBeUndefined();

            // Cleanup
            rmSync(join(TEST_PROJECT_DIR, 'package.json'));
            rmSync(nodeModulesDir, { recursive: true });
        });
    });
});