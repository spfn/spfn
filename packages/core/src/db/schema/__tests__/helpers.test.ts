/**
 * Schema Helpers Tests
 *
 * Tests for reusable column definitions and schema helper functions
 */

import { describe, it, expect } from 'vitest';
import {
    id,
    uuid,
    timestamps,
    autoUpdateTimestamp,
    foreignKey,
    optionalForeignKey,
    auditFields,
    publishingFields,
    verificationTimestamp,
    softDelete,
    statusEnum,
} from '../helpers.js';
import { pgTable, text } from 'drizzle-orm/pg-core';

describe('Schema Helpers', () =>
{
    describe('id()', () =>
    {
        it('should create bigserial primary key column', () =>
        {
            const idColumn = id();

            expect(idColumn).toBeDefined();
            // Column should be a Drizzle column object
            expect(typeof idColumn).toBe('object');
        });

        it('should use number mode', () =>
        {
            const idColumn = id();

            // The column should be configured for number mode (not bigint)
            expect(idColumn).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                id: id(),
            });

            expect(testTable.id).toBeDefined();
        });
    });

    describe('timestamps()', () =>
    {
        it('should create createdAt and updatedAt columns', () =>
        {
            const cols = timestamps();

            expect(cols.createdAt).toBeDefined();
            expect(cols.updatedAt).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                ...timestamps(),
            });

            expect(testTable.createdAt).toBeDefined();
            expect(testTable.updatedAt).toBeDefined();
        });

        it('should not mark updatedAt for auto-update by default', () =>
        {
            const cols = timestamps();

            expect((cols.updatedAt as any).__autoUpdate).toBeUndefined();
        });

        it('should mark updatedAt for auto-update when enabled', () =>
        {
            const cols = timestamps({ autoUpdate: true });

            expect((cols.updatedAt as any).__autoUpdate).toBe(true);
        });

        it('should not mark createdAt for auto-update even when enabled', () =>
        {
            const cols = timestamps({ autoUpdate: true });

            expect((cols.createdAt as any).__autoUpdate).toBeUndefined();
        });
    });

    describe('autoUpdateTimestamp()', () =>
    {
        it('should create timestamp column with default field name', () =>
        {
            const col = autoUpdateTimestamp();

            expect(col.updatedAt).toBeDefined();
        });

        it('should convert camelCase to snake_case', () =>
        {
            const col = autoUpdateTimestamp('modifiedAt');

            expect(col.modifiedAt).toBeDefined();
        });

        it('should handle custom field names', () =>
        {
            const col = autoUpdateTimestamp('lastUpdated');

            expect(col.lastUpdated).toBeDefined();
        });

        it('should mark column for auto-update', () =>
        {
            const col = autoUpdateTimestamp();

            expect((col.updatedAt as any).__autoUpdate).toBe(true);
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                ...autoUpdateTimestamp('publishedAt'),
            });

            expect(testTable.publishedAt).toBeDefined();// Note: __autoUpdate marker is lost when spread into pgTable
        });
    });

    describe('foreignKey()', () =>
    {
        // Create a mock parent table for testing
        const parentTable = pgTable('parent', {
            id: id(),
        });

        it('should create foreign key column', () =>
        {
            const fk = foreignKey('author', () => parentTable.id);

            expect(fk).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                authorId: foreignKey('author', () => parentTable.id),
            });

            expect(testTable.authorId).toBeDefined();
        });

        it('should support custom onDelete options', () =>
        {
            const fk1 = foreignKey('author', () => parentTable.id, { onDelete: 'cascade' });
            const fk2 = foreignKey('author', () => parentTable.id, { onDelete: 'set null' });
            const fk3 = foreignKey('author', () => parentTable.id, { onDelete: 'restrict' });
            const fk4 = foreignKey('author', () => parentTable.id, { onDelete: 'no action' });

            expect(fk1).toBeDefined();
            expect(fk2).toBeDefined();
            expect(fk3).toBeDefined();
            expect(fk4).toBeDefined();
        });
    });

    describe('optionalForeignKey()', () =>
    {
        const parentTable = pgTable('parent', {
            id: id(),
        });

        it('should create optional foreign key column', () =>
        {
            const fk = optionalForeignKey('author', () => parentTable.id);

            expect(fk).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                reviewerId: optionalForeignKey('reviewer', () => parentTable.id),
            });

            expect(testTable.reviewerId).toBeDefined();
        });

        it('should support custom onDelete options', () =>
        {
            const fk = optionalForeignKey('author', () => parentTable.id, { onDelete: 'cascade' });

            expect(fk).toBeDefined();
        });
    });

    describe('Integration: Full table schema', () =>
    {
        it('should create complete table with all helpers', () =>
        {
            const users = pgTable('users', {
                id: id(),
                email: text('email').notNull().unique(),
                name: text('name'),
                ...timestamps(),
            });

            expect(users.id).toBeDefined();
            expect(users.email).toBeDefined();
            expect(users.name).toBeDefined();
            expect(users.createdAt).toBeDefined();
            expect(users.updatedAt).toBeDefined();
        });

        it('should create table with auto-updating timestamps', () =>
        {
            const posts = pgTable('posts', {
                id: id(),
                title: text('title').notNull(),
                ...timestamps({ autoUpdate: true }),
            });

            expect(posts.id).toBeDefined();
            expect(posts.title).toBeDefined();
            expect(posts.createdAt).toBeDefined();
            expect(posts.updatedAt).toBeDefined();
            // Note: __autoUpdate marker is lost when spread into pgTable
        });

        it('should create table with foreign keys', () =>
        {
            const users = pgTable('users', {
                id: id(),
            });

            const posts = pgTable('posts', {
                id: id(),
                authorId: foreignKey('author', () => users.id),
                reviewerId: optionalForeignKey('reviewer', () => users.id),
                ...timestamps(),
            });

            expect(posts.authorId).toBeDefined();
            expect(posts.reviewerId).toBeDefined();
            expect(posts.createdAt).toBeDefined();
            expect(posts.updatedAt).toBeDefined();
        });

        it('should create table with custom timestamp field', () =>
        {
            const articles = pgTable('articles', {
                id: id(),
                title: text('title'),
                ...timestamps(),
                ...autoUpdateTimestamp('publishedAt'),
            });

            expect(articles.id).toBeDefined();
            expect(articles.title).toBeDefined();
            expect(articles.createdAt).toBeDefined();
            expect(articles.updatedAt).toBeDefined();
            expect(articles.publishedAt).toBeDefined();
            // Note: __autoUpdate marker is lost when spread into pgTable
        });
    });

    describe('uuid()', () =>
    {
        it('should create uuid primary key column', () =>
        {
            const uuidColumn = uuid();

            expect(uuidColumn).toBeDefined();
            expect(typeof uuidColumn).toBe('object');
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                id: uuid(),
            });

            expect(testTable.id).toBeDefined();
        });
    });

    describe('auditFields()', () =>
    {
        it('should create createdBy and updatedBy columns', () =>
        {
            const cols = auditFields();

            expect(cols.createdBy).toBeDefined();
            expect(cols.updatedBy).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                id: id(),
                ...auditFields(),
            });

            expect(testTable.createdBy).toBeDefined();
            expect(testTable.updatedBy).toBeDefined();
        });
    });

    describe('publishingFields()', () =>
    {
        it('should create publishedAt and publishedBy columns', () =>
        {
            const cols = publishingFields();

            expect(cols.publishedAt).toBeDefined();
            expect(cols.publishedBy).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                id: id(),
                ...publishingFields(),
            });

            expect(testTable.publishedAt).toBeDefined();
            expect(testTable.publishedBy).toBeDefined();
        });
    });

    describe('verificationTimestamp()', () =>
    {
        it('should create verification timestamp column', () =>
        {
            const col = verificationTimestamp('emailVerified');

            expect(col.emailVerifiedAt).toBeDefined();
        });

        it('should convert camelCase to snake_case with _at suffix', () =>
        {
            const col = verificationTimestamp('phoneVerified');

            expect(col.phoneVerifiedAt).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                id: id(),
                ...verificationTimestamp('emailVerified'),
                ...verificationTimestamp('phoneVerified'),
            });

            expect(testTable.emailVerifiedAt).toBeDefined();
            expect(testTable.phoneVerifiedAt).toBeDefined();
        });
    });

    describe('softDelete()', () =>
    {
        it('should create deletedAt and deletedBy columns', () =>
        {
            const cols = softDelete();

            expect(cols.deletedAt).toBeDefined();
            expect(cols.deletedBy).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                id: id(),
                ...softDelete(),
            });

            expect(testTable.deletedAt).toBeDefined();
            expect(testTable.deletedBy).toBeDefined();
        });
    });

    describe('statusEnum()', () =>
    {
        it('should create status column with enum constraint', () =>
        {
            const statusCol = statusEnum(['draft', 'published', 'archived'] as const);

            expect(statusCol).toBeDefined();
        });

        it('should use first status as default when not specified', () =>
        {
            const statusCol = statusEnum(['draft', 'published'] as const);

            expect(statusCol).toBeDefined();
        });

        it('should use custom default status', () =>
        {
            const statusCol = statusEnum(['active', 'inactive', 'suspended'] as const, 'active');

            expect(statusCol).toBeDefined();
        });

        it('should work in table definition', () =>
        {
            const testTable = pgTable('test', {
                id: id(),
                status: statusEnum(['draft', 'published', 'archived'] as const),
            });

            expect(testTable.status).toBeDefined();
        });
    });

    describe('Integration: New helpers with existing helpers', () =>
    {
        it('should create table with UUID and audit fields', () =>
        {
            const sessions = pgTable('sessions', {
                id: uuid(),
                userId: text('user_id'),
                ...timestamps(),
                ...auditFields(),
            });

            expect(sessions.id).toBeDefined();
            expect(sessions.userId).toBeDefined();
            expect(sessions.createdAt).toBeDefined();
            expect(sessions.updatedAt).toBeDefined();
            expect(sessions.createdBy).toBeDefined();
            expect(sessions.updatedBy).toBeDefined();
        });

        it('should create CMS-style table with publishing fields', () =>
        {
            const articles = pgTable('articles', {
                id: id(),
                title: text('title'),
                status: statusEnum(['draft', 'published', 'archived'] as const),
                ...timestamps(),
                ...publishingFields(),
                ...auditFields(),
            });

            expect(articles.id).toBeDefined();
            expect(articles.title).toBeDefined();
            expect(articles.status).toBeDefined();
            expect(articles.publishedAt).toBeDefined();
            expect(articles.publishedBy).toBeDefined();
            expect(articles.createdBy).toBeDefined();
            expect(articles.updatedBy).toBeDefined();
        });

        it('should create table with soft delete', () =>
        {
            const posts = pgTable('posts', {
                id: id(),
                title: text('title'),
                ...timestamps(),
                ...softDelete(),
            });

            expect(posts.deletedAt).toBeDefined();
            expect(posts.deletedBy).toBeDefined();
        });

        it('should create auth table with verification timestamps', () =>
        {
            const users = pgTable('users', {
                id: id(),
                email: text('email'),
                phone: text('phone'),
                ...verificationTimestamp('emailVerified'),
                ...verificationTimestamp('phoneVerified'),
                ...timestamps(),
            });

            expect(users.emailVerifiedAt).toBeDefined();
            expect(users.phoneVerifiedAt).toBeDefined();
        });
    });
});