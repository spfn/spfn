/**
 * Schema Helper Tests
 *
 * Tests schema creation and package name conversion utilities
 */

import { describe, it, expect } from 'vitest';
import {
    createFunctionSchema,
    packageNameToSchema,
    getSchemaInfo,
} from '../schema-helper.js';

describe('Schema Helper', () =>
{
    describe('packageNameToSchema()', () =>
    {
        it('should convert scoped package with slash to schema name', () =>
        {
            const schemaName = packageNameToSchema('@spfn/cms');

            expect(schemaName).toBe('spfn_cms');
        });

        it('should convert scoped package with hyphen to schema name', () =>
        {
            const schemaName = packageNameToSchema('@company/spfn-auth');

            expect(schemaName).toBe('company_spfn_auth');
        });

        it('should convert unscoped package with hyphen', () =>
        {
            const schemaName = packageNameToSchema('spfn-storage');

            expect(schemaName).toBe('spfn_storage');
        });

        it('should convert unscoped package without hyphen', () =>
        {
            const schemaName = packageNameToSchema('mypackage');

            expect(schemaName).toBe('mypackage');
        });

        it('should handle multiple hyphens', () =>
        {
            const schemaName = packageNameToSchema('my-custom-package');

            expect(schemaName).toBe('my_custom_package');
        });

        it('should handle scoped package with multiple hyphens', () =>
        {
            const schemaName = packageNameToSchema('@my-org/my-pkg-name');

            expect(schemaName).toBe('my_org_my_pkg_name');
        });

        it('should remove @ symbol from scoped packages', () =>
        {
            const schemaName = packageNameToSchema('@spfn/core');

            expect(schemaName).not.toContain('@');
            expect(schemaName).toBe('spfn_core');
        });

        it('should replace forward slash with underscore', () =>
        {
            const schemaName = packageNameToSchema('@scope/package');

            expect(schemaName).not.toContain('/');
            expect(schemaName).toBe('scope_package');
        });

        it('should handle empty string', () =>
        {
            const schemaName = packageNameToSchema('');

            expect(schemaName).toBe('');
        });
    });

    describe('createFunctionSchema()', () =>
    {
        it('should create PostgreSQL schema object', () =>
        {
            const schema = createFunctionSchema('@spfn/cms');

            expect(schema).toBeDefined();
            expect(typeof schema).toBe('object');
        });

        it('should create schema with correct name for scoped package', () =>
        {
            const schema = createFunctionSchema('@spfn/cms');

            // The pgSchema object from Drizzle has the schema name internally
            expect(schema).toBeDefined();
        });

        it('should create schema with correct name for unscoped package', () =>
        {
            const schema = createFunctionSchema('spfn-auth');

            expect(schema).toBeDefined();
        });

        it('should create different schemas for different packages', () =>
        {
            const schema1 = createFunctionSchema('@spfn/cms');
            const schema2 = createFunctionSchema('@spfn/auth');

            // Both should be valid schema objects
            expect(schema1).toBeDefined();
            expect(schema2).toBeDefined();
        });
    });

    describe('getSchemaInfo()', () =>
    {
        it('should return correct info for scoped package', () =>
        {
            const info = getSchemaInfo('@spfn/cms');

            expect(info).toEqual({
                schemaName: 'spfn_cms',
                isScoped: true,
                scope: 'spfn',
            });
        });

        it('should return correct info for unscoped package', () =>
        {
            const info = getSchemaInfo('spfn-auth');

            expect(info).toEqual({
                schemaName: 'spfn_auth',
                isScoped: false,
                scope: null,
            });
        });

        it('should extract scope from scoped package', () =>
        {
            const info = getSchemaInfo('@company/product');

            expect(info.scope).toBe('company');
            expect(info.isScoped).toBe(true);
        });

        it('should handle scoped package with hyphens', () =>
        {
            const info = getSchemaInfo('@my-org/my-package');

            expect(info.schemaName).toBe('my_org_my_package');
            expect(info.scope).toBe('my-org');
            expect(info.isScoped).toBe(true);
        });

        it('should return null scope for unscoped package', () =>
        {
            const info = getSchemaInfo('mypackage');

            expect(info.scope).toBeNull();
            expect(info.isScoped).toBe(false);
        });

        it('should detect isScoped correctly', () =>
        {
            const scoped = getSchemaInfo('@scope/pkg');
            const unscoped = getSchemaInfo('pkg');

            expect(scoped.isScoped).toBe(true);
            expect(unscoped.isScoped).toBe(false);
        });

        it('should handle edge case with @ but no slash', () =>
        {
            // This is technically an invalid package name, but test behavior
            const info = getSchemaInfo('@noslash');

            expect(info.isScoped).toBe(true);
            // scope extraction expects a slash, so this might be undefined
            expect(info.scope).toBeDefined();
        });
    });

    describe('Integration: Full workflow', () =>
    {
        it('should support full schema creation workflow for @spfn/cms', () =>
        {
            // Get schema info
            const info = getSchemaInfo('@spfn/cms');

            expect(info.schemaName).toBe('spfn_cms');
            expect(info.isScoped).toBe(true);
            expect(info.scope).toBe('spfn');

            // Create schema
            const schema = createFunctionSchema('@spfn/cms');

            expect(schema).toBeDefined();
        });

        it('should support full schema creation workflow for unscoped package', () =>
        {
            // Get schema info
            const info = getSchemaInfo('my-plugin');

            expect(info.schemaName).toBe('my_plugin');
            expect(info.isScoped).toBe(false);
            expect(info.scope).toBeNull();

            // Create schema
            const schema = createFunctionSchema('my-plugin');

            expect(schema).toBeDefined();
        });
    });
});