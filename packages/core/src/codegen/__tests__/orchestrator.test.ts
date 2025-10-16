/**
 * Orchestrator Tests
 *
 * Tests for the codegen orchestrator system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import { CodegenOrchestrator } from '../orchestrator.js';
import type { Generator, GeneratorOptions } from '../generator.js';

const TEST_DIR = resolve(process.cwd(), '.test-tmp-orchestrator');

describe('Orchestrator', () =>
{
    beforeEach(() =>
    {
        mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() =>
    {
        rmSync(TEST_DIR, { recursive: true, force: true });
    });

    describe('CodegenOrchestrator', () =>
    {
        it('should run single generator', async () =>
        {
            let generated = false;

            const mockGen: Generator = {
                name: 'test-gen',
                watchPatterns: ['**/*.test'],
                async generate(options: GeneratorOptions)
                {
                    generated = true;
                }
            };

            const orchestrator = new CodegenOrchestrator({
                generators: [mockGen],
                cwd: TEST_DIR,
                debug: false
            });

            await orchestrator.generateAll();

            expect(generated).toBe(true);
        });

        it('should run multiple generators', async () =>
        {
            const results: string[] = [];

            const gen1: Generator = {
                name: 'gen-1',
                watchPatterns: ['**/*.a'],
                async generate()
                {
                    results.push('gen-1');
                }
            };

            const gen2: Generator = {
                name: 'gen-2',
                watchPatterns: ['**/*.b'],
                async generate()
                {
                    results.push('gen-2');
                }
            };

            const orchestrator = new CodegenOrchestrator({
                generators: [gen1, gen2],
                cwd: TEST_DIR,
                debug: false
            });

            await orchestrator.generateAll();

            expect(results).toEqual(['gen-1', 'gen-2']);
        });

        it('should handle generator errors gracefully', async () =>
        {
            const results: string[] = [];

            const failingGen: Generator = {
                name: 'failing',
                watchPatterns: ['**/*.fail'],
                async generate()
                {
                    throw new Error('Generator failed');
                }
            };

            const successGen: Generator = {
                name: 'success',
                watchPatterns: ['**/*.ok'],
                async generate()
                {
                    results.push('success');
                }
            };

            const orchestrator = new CodegenOrchestrator({
                generators: [failingGen, successGen],
                cwd: TEST_DIR,
                debug: false
            });

            // Should not throw, should continue with other generators
            await orchestrator.generateAll();

            expect(results).toEqual(['success']);
        });
    });

});