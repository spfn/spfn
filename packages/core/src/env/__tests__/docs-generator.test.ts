/**
 * Documentation Generator Tests
 *
 * Tests for automatic documentation generation from schemas
 */

import { describe, it, expect } from 'vitest';
import {
    generateMarkdownDocs,
    generateEnvExample,
    generateJsonDocs,
} from '../docs-generator';
import {
    EnvRegistry,
    createEnvRegistry,
} from '../registry';
import {
    defineEnvSchema,
    envString,
    envNumber,
    envBoolean,
    envUrl,
} from '../schema';
import { parsePostgresUrl, createNumberParser } from '../validator';

describe('Documentation Generator', () =>
{
    describe('generateMarkdownDocs', () =>
    {
        it('should generate markdown documentation', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'PostgreSQL database connection',
                        required: true,
                        sensitive: true,
                        category: 'database',
                    }),
                    key: 'DATABASE_URL',
                },
                PORT: {
                    ...envNumber({
                        description: 'Server port number',
                        default: 3000,
                        category: 'server',
                    }),
                    key: 'PORT',
                },
            });

            const registry = createEnvRegistry(schema);
            const markdown = generateMarkdownDocs(registry);

            expect(markdown).toContain('# Environment Variables');
            expect(markdown).toContain('DATABASE_URL');
            expect(markdown).toContain('PORT');
            expect(markdown).toContain('PostgreSQL database connection');
            expect(markdown).toContain('Server port number');
        });

        it('should include summary statistics', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        required: true,
                        sensitive: true,
                    }),
                    key: 'DATABASE_URL',
                },
                API_KEY: {
                    ...envString({
                        description: 'API Key',
                        required: true,
                        sensitive: true,
                    }),
                    key: 'API_KEY',
                },
                PORT: {
                    ...envNumber({
                        description: 'Port',
                        default: 3000,
                    }),
                    key: 'PORT',
                },
                NEXT_PUBLIC_API_URL: {
                    ...envUrl({
                        description: 'Public API URL',
                    }),
                    key: 'NEXT_PUBLIC_API_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const markdown = generateMarkdownDocs(registry);

            expect(markdown).toContain('## Summary');
            expect(markdown).toContain('**Total**: 4 variables');
            expect(markdown).toContain('**Required**: 2');
            expect(markdown).toContain('**Sensitive**: 2');
            expect(markdown).toContain('**Server Only**: 3');
            expect(markdown).toContain('**Client Accessible**: 1');
        });

        it('should group by category', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        category: 'database',
                    }),
                    key: 'DATABASE_URL',
                },
                API_URL: {
                    ...envString({
                        description: 'API URL',
                        category: 'api',
                    }),
                    key: 'API_URL',
                },
                API_KEY: {
                    ...envString({
                        description: 'API Key',
                        category: 'api',
                    }),
                    key: 'API_KEY',
                },
            });

            const registry = createEnvRegistry(schema);
            const markdown = generateMarkdownDocs(registry);

            expect(markdown).toContain('## database');
            expect(markdown).toContain('## api');
        });

        it('should show runtime environment (client vs server)', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'Server-only variable',
                    }),
                    key: 'DATABASE_URL',
                },
                NEXT_PUBLIC_API_URL: {
                    ...envString({
                        description: 'Client-accessible variable',
                    }),
                    key: 'NEXT_PUBLIC_API_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const markdown = generateMarkdownDocs(registry);

            expect(markdown).toContain('🖥️');
            expect(markdown).toContain('Server only');
            expect(markdown).toContain('🌐');
            expect(markdown).toContain('Client + Server');
        });

        it('should include examples if provided', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        examples: [
                            'postgresql://localhost:5432/mydb',
                            'postgresql://user:pass@host:5432/db',
                        ],
                    }),
                    key: 'DATABASE_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const markdown = generateMarkdownDocs(registry);

            expect(markdown).toContain('**Examples:**');
            expect(markdown).toContain('postgresql://localhost:5432/mydb');
        });

        it('should mark sensitive variables', () =>
        {
            const schema = defineEnvSchema({
                API_KEY: {
                    ...envString({
                        description: 'Secret API key',
                        sensitive: true,
                    }),
                    key: 'API_KEY',
                },
            });

            const registry = createEnvRegistry(schema);
            const markdown = generateMarkdownDocs(registry);

            expect(markdown).toContain('🔒 Sensitive');
        });
    });

    describe('generateEnvExample', () =>
    {
        it('should generate .env.example file', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'PostgreSQL database connection',
                        required: true,
                        category: 'database',
                    }),
                    key: 'DATABASE_URL',
                },
                PORT: {
                    ...envNumber({
                        description: 'Server port',
                        default: 3000,
                        category: 'server',
                    }),
                    key: 'PORT',
                },
            });

            const registry = createEnvRegistry(schema);
            const example = generateEnvExample(registry);

            expect(example).toContain('# Environment Variables');
            expect(example).toContain('# Auto-generated from schema');
            expect(example).toContain('DATABASE_URL');
            expect(example).toContain('PORT');
        });

        it('should include descriptions as comments', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'PostgreSQL database connection',
                    }),
                    key: 'DATABASE_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const example = generateEnvExample(registry);

            expect(example).toContain('# PostgreSQL database connection');
        });

        it('should include examples as comments', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        examples: ['postgresql://localhost:5432/mydb'],
                    }),
                    key: 'DATABASE_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const example = generateEnvExample(registry);

            expect(example).toContain('# Example: postgresql://localhost:5432/mydb');
        });

        it('should comment out optional variables', () =>
        {
            const schema = defineEnvSchema({
                OPTIONAL_VAR: {
                    ...envString({
                        description: 'Optional variable',
                        required: false,
                    }),
                    key: 'OPTIONAL_VAR',
                },
            });

            const registry = createEnvRegistry(schema);
            const example = generateEnvExample(registry);

            expect(example).toContain('# OPTIONAL_VAR=');
        });

        it('should not comment out required variables', () =>
        {
            const schema = defineEnvSchema({
                REQUIRED_VAR: {
                    ...envString({
                        description: 'Required variable',
                        required: true,
                    }),
                    key: 'REQUIRED_VAR',
                },
            });

            const registry = createEnvRegistry(schema);
            const example = generateEnvExample(registry);

            expect(example).toContain('REQUIRED_VAR=');
            expect(example).not.toMatch(/^# REQUIRED_VAR=/m);
        });

        it('should include default values', () =>
        {
            const schema = defineEnvSchema({
                PORT: {
                    ...envNumber({
                        description: 'Port',
                        default: 3000,
                    }),
                    key: 'PORT',
                },
            });

            const registry = createEnvRegistry(schema);
            const example = generateEnvExample(registry);

            expect(example).toContain('PORT=3000');
        });

        it('should mark sensitive variables', () =>
        {
            const schema = defineEnvSchema({
                API_KEY: {
                    ...envString({
                        description: 'Secret key',
                        sensitive: true,
                    }),
                    key: 'API_KEY',
                },
            });

            const registry = createEnvRegistry(schema);
            const example = generateEnvExample(registry);

            expect(example).toContain('# 🔒 Sensitive information');
        });

        it('should group by category', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        category: 'database',
                    }),
                    key: 'DATABASE_URL',
                },
                API_KEY: {
                    ...envString({
                        description: 'API Key',
                        category: 'api',
                    }),
                    key: 'API_KEY',
                },
            });

            const registry = createEnvRegistry(schema);
            const example = generateEnvExample(registry);

            expect(example).toContain('# database');
            expect(example).toContain('# api');
        });
    });

    describe('generateJsonDocs', () =>
    {
        it('should generate JSON documentation', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'DB URL',
                        required: true,
                        sensitive: true,
                        category: 'database',
                    }),
                    key: 'DATABASE_URL',
                },
                PORT: {
                    ...envNumber({
                        description: 'Port',
                        default: 3000,
                        category: 'server',
                    }),
                    key: 'PORT',
                },
            });

            const registry = createEnvRegistry(schema);
            const jsonString = generateJsonDocs(registry);
            const json = JSON.parse(jsonString);

            expect(json).toHaveProperty('metadata');
            expect(json).toHaveProperty('variables');
            expect(json.variables).toHaveLength(2);
        });

        it('should include metadata', () =>
        {
            const schema = defineEnvSchema({
                VAR1: {
                    ...envString({
                        description: 'Variable 1',
                        required: true,
                    }),
                    key: 'VAR1',
                },
                VAR2: {
                    ...envString({
                        description: 'Variable 2',
                        sensitive: true,
                    }),
                    key: 'VAR2',
                },
                NEXT_PUBLIC_VAR: {
                    ...envString({
                        description: 'Public variable',
                    }),
                    key: 'NEXT_PUBLIC_VAR',
                },
            });

            const registry = createEnvRegistry(schema);
            const jsonString = generateJsonDocs(registry);
            const json = JSON.parse(jsonString);

            expect(json.metadata.totalCount).toBe(3);
            expect(json.metadata.requiredCount).toBe(1);
            expect(json.metadata.sensitiveCount).toBe(1);
            expect(json.metadata.serverOnlyCount).toBe(2);
            expect(json.metadata.clientAccessibleCount).toBe(1);
            expect(json.metadata).toHaveProperty('generatedAt');
        });

        it('should include variable details', () =>
        {
            const schema = defineEnvSchema({
                DATABASE_URL: {
                    ...envString({
                        description: 'PostgreSQL connection',
                        required: true,
                        sensitive: true,
                        category: 'database',
                        examples: ['postgresql://localhost:5432/db'],
                    }),
                    key: 'DATABASE_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const jsonString = generateJsonDocs(registry);
            const json = JSON.parse(jsonString);

            const dbVar = json.variables[0];
            expect(dbVar.key).toBe('DATABASE_URL');
            expect(dbVar.description).toBe('PostgreSQL connection');
            expect(dbVar.type).toBe('string');
            expect(dbVar.required).toBe(true);
            expect(dbVar.sensitive).toBe(true);
            expect(dbVar.category).toBe('database');
            expect(dbVar.isClientAccessible).toBe(false);
            expect(dbVar.examples).toEqual(['postgresql://localhost:5432/db']);
        });

        it('should mark client-accessible variables', () =>
        {
            const schema = defineEnvSchema({
                NEXT_PUBLIC_API_URL: {
                    ...envString({
                        description: 'Public API URL',
                    }),
                    key: 'NEXT_PUBLIC_API_URL',
                },
            });

            const registry = createEnvRegistry(schema);
            const jsonString = generateJsonDocs(registry);
            const json = JSON.parse(jsonString);

            expect(json.variables[0].isClientAccessible).toBe(true);
        });

        it('should be valid JSON', () =>
        {
            const schema = defineEnvSchema({
                VAR1: {
                    ...envString({ description: 'Variable' }),
                    key: 'VAR1',
                },
            });

            const registry = createEnvRegistry(schema);
            const jsonString = generateJsonDocs(registry);

            expect(() => JSON.parse(jsonString)).not.toThrow();
        });
    });
});