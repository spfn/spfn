import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase } from '../../db';
import { startServer } from '../start-server';

vi.mock('@hono/node-server', () => ({
    serve: vi.fn(() => ({
        close: (callback: (error?: Error) => void) => callback(),
        requestTimeout: 0,
        keepAliveTimeout: 0,
        headersTimeout: 0,
    })),
}));

describe('server database provider lifecycle', () =>
{
    afterEach(async () =>
    {
        await closeDatabase();
    });

    it('initializes and closes an external provider through server lifecycle', async () =>
    {
        const close = vi.fn(async () =>
        {});
        const database: any = { execute: vi.fn(async () =>
        {}) };
        const instance = await startServer({
            host: '127.0.0.1',
            port: 39997,
            infrastructure: {
                database: true,
                redis: false,
            },
            database: {
                provider: {
                    kind: 'test-provider',
                    write: database,
                    close,
                },
            },
        });

        expect(database.execute).toHaveBeenCalledWith('SELECT 1');

        await instance.close();
        await instance.close();

        expect(close).toHaveBeenCalledTimes(1);
    });
});
