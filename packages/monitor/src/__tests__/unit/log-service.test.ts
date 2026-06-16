/**
 * @spfn/monitor - Log Service Tests
 *
 * Tests log write/query with mocked repository
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock repository
vi.mock('../../server/repositories', () =>
{
    const mockLogsRepo = {
        create: vi.fn(),
        findMany: vi.fn(),
        deleteOlderThan: vi.fn(),
    };

    return {
        logsRepository: mockLogsRepo,
    };
});

import { writeLog, queryLogs, setLogStore, getLogStore } from '../../server/services/log.service';
import { logsRepository } from '../../server/repositories';
import type { LogStore } from '../../server/services/log.service';

const mockLog = {
    id: 1,
    level: 'info' as const,
    message: 'test log',
    source: 'test',
    requestId: null,
    userId: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('Log Service', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
    });

    describe('writeLog', () =>
    {
        it('should write a log entry via repository', async () =>
        {
            (logsRepository.create as any).mockResolvedValue(mockLog);

            const result = await writeLog({
                level: 'info',
                message: 'test log',
                source: 'test',
            });

            expect(result).toEqual(mockLog);
        });

        it('should pass all params to repository', async () =>
        {
            (logsRepository.create as any).mockResolvedValue(mockLog);

            await writeLog({
                level: 'error',
                message: 'critical failure',
                source: 'payment',
                requestId: 'req-456',
                userId: 'user-789',
                metadata: { orderId: 123 },
            });

            expect(logsRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    level: 'error',
                    message: 'critical failure',
                    source: 'payment',
                    requestId: 'req-456',
                    userId: 'user-789',
                    metadata: { orderId: 123 },
                }),
            );
        });
    });

    describe('queryLogs', () =>
    {
        it('should query logs with filters', async () =>
        {
            (logsRepository.findMany as any).mockResolvedValue([mockLog]);

            const result = await queryLogs({
                level: 'info',
                source: 'test',
                limit: 10,
            });

            expect(result).toEqual([mockLog]);
            expect(logsRepository.findMany).toHaveBeenCalledWith({
                level: 'info',
                source: 'test',
                limit: 10,
            });
        });
    });

    describe('custom LogStore', () =>
    {
        let originalStore: LogStore;

        beforeEach(() =>
        {
            originalStore = getLogStore();
        });

        afterEach(() =>
        {
            // Restore original store
            setLogStore(originalStore);
        });

        it('should use custom store after setLogStore', async () =>
        {
            const customStore: LogStore = {
                write: vi.fn().mockResolvedValue(mockLog),
                query: vi.fn().mockResolvedValue([mockLog]),
                purge: vi.fn().mockResolvedValue(5),
            };

            setLogStore(customStore);

            await writeLog({ level: 'info', message: 'test' });
            expect(customStore.write).toHaveBeenCalled();

            await queryLogs({ level: 'info' });
            expect(customStore.query).toHaveBeenCalled();
        });
    });
});
