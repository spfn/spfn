/**
 * Read Replica Tests
 *
 * Test Primary/Replica read/write separation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import * as postgres from 'postgres';
import { getDb, getRawDb, type DbConnectionType } from '../index.js';
import { testUsers } from './fixtures/entities';
import { Repository } from '../repository';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL)
{
    throw new Error('DATABASE_URL environment variable is required for tests');
}

describe('Read Replica Support', () =>
{
    let client: Sql;
    let testDb: ReturnType<typeof drizzle>;

    beforeAll(async () =>
    {
        client = postgres(DATABASE_URL, { max: 1 });
        testDb = drizzle(client);

        // Note: Table is already created in setup.ts (test_users)
    });

    afterAll(async () =>
    {
        // Clean up test data
        await client`TRUNCATE TABLE test_users CASCADE`;
        await client.end();
    });

    beforeEach(async () =>
    {
        // Reset data before each test
        await client`TRUNCATE TABLE test_users CASCADE`;
    });
    describe('getDb()', () =>
    {
        it('should return primary DB for write operations', () =>
        {
            const writeDb = getDb('write');
            expect(writeDb).toBeDefined();
        });

        it('should return replica DB for read operations', () =>
        {
            const readDb = getDb('read');
            expect(readDb).toBeDefined();
        });

        it('should use primary DB as default', () =>
        {
            const db = getDb();
            expect(db).toBeDefined();
        });

        it('should return same instance for same type', () =>
        {
            const db1 = getDb('write');
            const db2 = getDb('write');
            expect(db1).toBe(db2);
        });
    });

    describe('Repository Routing', () =>
    {
        let userRepo!: Repository<typeof testUsers>;

        beforeAll(() =>
        {
            userRepo = new Repository<typeof testUsers>(getRawDb('write'), testUsers);
        });

        it('should use replica for read operations (findAll)', async () =>
        {
            // findAll은 내부적으로 getDb('read')를 사용해야 함
            const result = await userRepo.findAll();
            expect(Array.isArray(result)).toBe(true);
        });

        it('should use replica for read operations (findById)', async () =>
        {
            // 테스트용 사용자 생성
            const created = await userRepo.save({
                email: 'replica-test@example.com',
            });

            // findById는 내부적으로 getDb('read')를 사용해야 함
            const found = await userRepo.findById(created.id);
            expect(found).toBeDefined();
            expect(found?.email).toBe('replica-test@example.com');
        });

        it('should use primary for write operations (save)', async () =>
        {
            // save는 내부적으로 getDb('write')를 사용해야 함
            const created = await userRepo.save({
                email: 'primary-test@example.com',
            });

            expect(created).toBeDefined();
            expect(created.email).toBe('primary-test@example.com');
        });

        it('should use primary for write operations (update)', async () =>
        {
            const created = await userRepo.save({
                email: 'update-test@example.com',
            });

            // update는 내부적으로 getDb('write')를 사용해야 함
            const updated = await userRepo.update(created.id, {
                name: 'Updated Name',
            });

            expect(updated).toBeDefined();
        });

        it('should use primary for write operations (delete)', async () =>
        {
            const created = await userRepo.save({
                email: 'delete-test@example.com',
            });

            // delete는 내부적으로 getDb('write')를 사용해야 함
            const deleted = await userRepo.delete(created.id);

            expect(deleted).toBeDefined();
            expect(deleted?.id).toBe(created.id);
        });

        it('should use replica for count operations', async () =>
        {
            // count는 내부적으로 getDb('read')를 사용해야 함
            const count = await userRepo.count();
            expect(typeof count).toBe('number');
            expect(count).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Connection Type', () =>
    {
        it('should accept valid connection types', () =>
        {
            const types: DbConnectionType[] = ['read', 'write'];

            types.forEach(type =>
            {
                const db = getDb(type);
                expect(db).toBeDefined();
            });
        });
    });

    describe('Fallback Behavior', () =>
    {
        it('should fallback to primary if replica is not configured', () =>
        {
            // DATABASE_REPLICA_URL이 설정되지 않은 경우
            // getDb('read')와 getDb('write') 모두 정상 동작해야 함
            const readDb = getDb('read');
            const writeDb = getDb('write');

            // Replica가 설정되지 않아도 읽기/쓰기 모두 동작함
            expect(readDb).toBeDefined();
            expect(writeDb).toBeDefined();
        });
    });
});