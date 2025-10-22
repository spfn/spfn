/**
 * Database Helper Functions Unit Tests
 *
 * Tests helper functions with mocked database
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq, gt } from 'drizzle-orm';
import { pgTable, text, serial, integer } from 'drizzle-orm/pg-core';
import * as managerModule from '../manager/index.js';
import {
    findOne,
    findMany,
    create,
    createMany,
    updateOne,
    updateMany,
    deleteOne,
    deleteMany,
    count,
} from '../helpers.js';

// Test schema
const testUsers = pgTable('test_users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    age: integer('age'),
});

// Mock database responses
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockOffset = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();

describe('Database Helper Functions', () =>
{
    let mockDb: any;

    beforeEach(() =>
    {
        // Reset all mocks
        vi.clearAllMocks();

        // Create mock database with chainable methods
        mockDb = {
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            delete: mockDelete,
        };

        // Create chainable query builder object
        const createChainableQuery = (result: any[] = []) => ({
            where: mockWhere,
            limit: mockLimit,
            orderBy: mockOrderBy,
            offset: mockOffset,
            returning: mockReturning,
            then: (cb: any) => cb(result),
        });

        // Setup chainable mock responses
        mockSelect.mockReturnValue({ from: mockFrom });
        mockFrom.mockImplementation(() => createChainableQuery());
        mockWhere.mockImplementation(() => createChainableQuery());
        mockLimit.mockImplementation(() => createChainableQuery());
        mockOrderBy.mockImplementation(() => createChainableQuery());
        mockOffset.mockImplementation(() => createChainableQuery());

        mockInsert.mockReturnValue({ values: mockValues });
        mockValues.mockReturnValue({ returning: mockReturning });
        mockReturning.mockResolvedValue([]);

        mockUpdate.mockReturnValue({ set: mockSet });
        mockSet.mockReturnValue({ where: mockWhere, returning: mockReturning });

        mockDelete.mockReturnValue({ where: mockWhere, returning: mockReturning });

        // Mock getDatabase
        vi.spyOn(managerModule, 'getDatabase').mockReturnValue(mockDb);
    });

    describe('findOne', () =>
    {
        it('should find one record with object-based where', async () =>
        {
            const mockUser = { id: 1, name: 'Test', email: 'test@example.com', age: 25 };
            mockLimit.mockImplementation(() => ({
                then: (cb: any) => cb([mockUser])
            }));

            const result = await findOne(testUsers, { id: 1 });

            expect(managerModule.getDatabase).toHaveBeenCalledWith('read');
            expect(mockSelect).toHaveBeenCalled();
            expect(mockFrom).toHaveBeenCalled();
            expect(mockWhere).toHaveBeenCalled();
            expect(mockLimit).toHaveBeenCalledWith(1);
            expect(result).toEqual(mockUser);
        });

        it('should find one record with SQL-based where', async () =>
        {
            const mockUser = { id: 1, name: 'Test', email: 'test@example.com', age: 25 };
            mockLimit.mockImplementation(() => ({
                then: (cb: any) => cb([mockUser])
            }));

            const result = await findOne(testUsers, eq(testUsers.id, 1));

            expect(mockWhere).toHaveBeenCalled();
            expect(result).toEqual(mockUser);
        });

        it('should return null when no record found', async () =>
        {
            mockLimit.mockImplementation(() => ({
                then: (cb: any) => cb([])
            }));

            const result = await findOne(testUsers, { id: 999 });

            expect(result).toBeNull();
        });

        it('should throw error when database not initialized', async () =>
        {
            vi.spyOn(managerModule, 'getDatabase').mockReturnValue(null);

            await expect(findOne(testUsers, { id: 1 }))
                .rejects.toThrow('Database not initialized');
        });

        it('should throw error when where condition is empty', async () =>
        {
            await expect(findOne(testUsers, {}))
                .rejects.toThrow('findOne requires at least one where condition');
        });
    });

    describe('findMany', () =>
    {
        it('should find many records with object-based where', async () =>
        {
            const mockUsers = [
                { id: 1, name: 'User1', email: 'user1@example.com', age: 25 },
                { id: 2, name: 'User2', email: 'user2@example.com', age: 30 },
            ];
            mockFrom.mockReturnValue({ where: mockWhere, then: (cb: any) => cb(mockUsers) });
            mockWhere.mockReturnValue({ then: (cb: any) => cb(mockUsers) });

            const result = await findMany(testUsers, {
                where: { age: 25 }
            });

            expect(managerModule.getDatabase).toHaveBeenCalledWith('read');
            expect(result).toEqual(mockUsers);
        });

        it('should find many records with SQL-based where', async () =>
        {
            const mockUsers = [{ id: 1, name: 'User1', email: 'user1@example.com', age: 25 }];
            mockWhere.mockReturnValue({ then: (cb: any) => cb(mockUsers) });

            const result = await findMany(testUsers, {
                where: gt(testUsers.age, 20)
            });

            expect(result).toEqual(mockUsers);
        });

        it('should apply limit and offset', async () =>
        {
            mockOffset.mockReturnValue({ then: (cb: any) => cb([]) });

            await findMany(testUsers, {
                limit: 10,
                offset: 20
            });

            expect(mockLimit).toHaveBeenCalledWith(10);
            expect(mockOffset).toHaveBeenCalledWith(20);
        });

        it('should apply orderBy', async () =>
        {
            mockOrderBy.mockReturnValue({ then: (cb: any) => cb([]) });

            await findMany(testUsers, {
                orderBy: eq(testUsers.id, 1) // Mock SQL
            });

            expect(mockOrderBy).toHaveBeenCalled();
        });

        it('should return empty array when no records found', async () =>
        {
            mockFrom.mockReturnValue({ then: (cb: any) => cb([]) });

            const result = await findMany(testUsers);

            expect(result).toEqual([]);
        });
    });

    describe('create', () =>
    {
        it('should create a single record', async () =>
        {
            const newUser = { name: 'New User', email: 'new@example.com', age: 20 };
            const createdUser = { id: 1, ...newUser };
            mockReturning.mockResolvedValue([createdUser]);

            const result = await create(testUsers, newUser);

            expect(managerModule.getDatabase).toHaveBeenCalledWith('write');
            expect(mockInsert).toHaveBeenCalledWith(testUsers);
            expect(mockValues).toHaveBeenCalledWith(newUser);
            expect(mockReturning).toHaveBeenCalled();
            expect(result).toEqual(createdUser);
        });

        it('should throw error when database not initialized', async () =>
        {
            vi.spyOn(managerModule, 'getDatabase').mockReturnValue(null);

            await expect(create(testUsers, { name: 'Test', email: 'test@example.com' }))
                .rejects.toThrow('Database not initialized');
        });
    });

    describe('createMany', () =>
    {
        it('should create multiple records', async () =>
        {
            const newUsers = [
                { name: 'User1', email: 'user1@example.com', age: 20 },
                { name: 'User2', email: 'user2@example.com', age: 25 },
            ];
            const createdUsers = [
                { id: 1, ...newUsers[0] },
                { id: 2, ...newUsers[1] },
            ];
            mockReturning.mockResolvedValue(createdUsers);

            const result = await createMany(testUsers, newUsers);

            expect(mockInsert).toHaveBeenCalledWith(testUsers);
            expect(mockValues).toHaveBeenCalledWith(newUsers);
            expect(result).toEqual(createdUsers);
        });
    });

    describe('updateOne', () =>
    {
        it('should update one record with object-based where', async () =>
        {
            const updatedUser = { id: 1, name: 'Updated', email: 'updated@example.com', age: 30 };
            mockReturning.mockResolvedValue([updatedUser]);

            const result = await updateOne(testUsers, { id: 1 }, { name: 'Updated' });

            expect(managerModule.getDatabase).toHaveBeenCalledWith('write');
            expect(mockUpdate).toHaveBeenCalledWith(testUsers);
            expect(mockSet).toHaveBeenCalledWith({ name: 'Updated' });
            expect(mockWhere).toHaveBeenCalled();
            expect(result).toEqual(updatedUser);
        });

        it('should update one record with SQL-based where', async () =>
        {
            const updatedUser = { id: 1, name: 'Updated', email: 'updated@example.com', age: 30 };
            mockReturning.mockResolvedValue([updatedUser]);

            const result = await updateOne(testUsers, eq(testUsers.id, 1), { name: 'Updated' });

            expect(result).toEqual(updatedUser);
        });

        it('should return null when no record updated', async () =>
        {
            mockReturning.mockResolvedValue([]);

            const result = await updateOne(testUsers, { id: 999 }, { name: 'Updated' });

            expect(result).toBeNull();
        });

        it('should throw error when where condition is empty', async () =>
        {
            await expect(updateOne(testUsers, {}, { name: 'Updated' }))
                .rejects.toThrow('updateOne requires at least one where condition');
        });
    });

    describe('updateMany', () =>
    {
        it('should update multiple records', async () =>
        {
            const updatedUsers = [
                { id: 1, name: 'Updated1', email: 'user1@example.com', age: 25 },
                { id: 2, name: 'Updated2', email: 'user2@example.com', age: 25 },
            ];
            mockReturning.mockResolvedValue(updatedUsers);

            const result = await updateMany(testUsers, { age: 25 }, { name: 'Updated' });

            expect(mockUpdate).toHaveBeenCalled();
            expect(result).toEqual(updatedUsers);
        });
    });

    describe('deleteOne', () =>
    {
        it('should delete one record with object-based where', async () =>
        {
            const deletedUser = { id: 1, name: 'Deleted', email: 'deleted@example.com', age: 25 };
            mockReturning.mockResolvedValue([deletedUser]);

            const result = await deleteOne(testUsers, { id: 1 });

            expect(managerModule.getDatabase).toHaveBeenCalledWith('write');
            expect(mockDelete).toHaveBeenCalledWith(testUsers);
            expect(mockWhere).toHaveBeenCalled();
            expect(result).toEqual(deletedUser);
        });

        it('should delete one record with SQL-based where', async () =>
        {
            const deletedUser = { id: 1, name: 'Deleted', email: 'deleted@example.com', age: 25 };
            mockReturning.mockResolvedValue([deletedUser]);

            const result = await deleteOne(testUsers, eq(testUsers.id, 1));

            expect(result).toEqual(deletedUser);
        });

        it('should return null when no record deleted', async () =>
        {
            mockReturning.mockResolvedValue([]);

            const result = await deleteOne(testUsers, { id: 999 });

            expect(result).toBeNull();
        });

        it('should throw error when where condition is empty', async () =>
        {
            await expect(deleteOne(testUsers, {}))
                .rejects.toThrow('deleteOne requires at least one where condition');
        });
    });

    describe('deleteMany', () =>
    {
        it('should delete multiple records', async () =>
        {
            const deletedUsers = [
                { id: 1, name: 'User1', email: 'user1@example.com', age: 25 },
                { id: 2, name: 'User2', email: 'user2@example.com', age: 25 },
            ];
            mockReturning.mockResolvedValue(deletedUsers);

            const result = await deleteMany(testUsers, { age: 25 });

            expect(mockDelete).toHaveBeenCalled();
            expect(result).toEqual(deletedUsers);
        });
    });

    describe('count', () =>
    {
        it('should count all records', async () =>
        {
            const mockUsers = [
                { id: 1, name: 'User1', email: 'user1@example.com', age: 25 },
                { id: 2, name: 'User2', email: 'user2@example.com', age: 30 },
            ];
            mockFrom.mockReturnValue({ then: (cb: any) => cb(mockUsers) });

            const result = await count(testUsers);

            expect(managerModule.getDatabase).toHaveBeenCalledWith('read');
            expect(result).toBe(2);
        });

        it('should count records with object-based where', async () =>
        {
            const mockUsers = [{ id: 1, name: 'User1', email: 'user1@example.com', age: 25 }];
            mockWhere.mockReturnValue({ then: (cb: any) => cb(mockUsers) });

            const result = await count(testUsers, { age: 25 });

            expect(result).toBe(1);
        });

        it('should count records with SQL-based where', async () =>
        {
            const mockUsers = [{ id: 1, name: 'User1', email: 'user1@example.com', age: 25 }];
            mockWhere.mockReturnValue({ then: (cb: any) => cb(mockUsers) });

            const result = await count(testUsers, gt(testUsers.age, 20));

            expect(result).toBe(1);
        });

        it('should return 0 when no records found', async () =>
        {
            mockFrom.mockReturnValue({ then: (cb: any) => cb([]) });

            const result = await count(testUsers);

            expect(result).toBe(0);
        });
    });

    describe('buildWhereFromObject (implicit)', () =>
    {
        it('should handle multiple conditions with AND', async () =>
        {
            mockLimit.mockImplementation(() => ({
                then: (cb: any) => cb([])
            }));

            await findOne(testUsers, { name: 'Test', age: 25 });

            // Verify that where was called (meaning multiple conditions were combined)
            expect(mockWhere).toHaveBeenCalled();
        });

        it('should filter out undefined values', async () =>
        {
            mockLimit.mockImplementation(() => ({
                then: (cb: any) => cb([])
            }));

            await findOne(testUsers, { name: 'Test', age: undefined as any });

            // Should still work with only one condition
            expect(mockWhere).toHaveBeenCalled();
        });
    });
});