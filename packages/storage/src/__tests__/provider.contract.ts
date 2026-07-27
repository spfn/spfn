/**
 * provider 공용 계약 스위트 — local·S3 호환·GCS 어느 구현이든 이 케이스를 그대로 통과해야 한다.
 *
 * 이 파일 자체는 vitest가 수집하지 않는다(`*.test.ts`가 아님). `contract.*.test.ts`가
 * 하네스를 넘겨 등록한다. 케이스마다 다른 키 루트를 써서 실버킷에서 잔재가 겹치지 않게 한다.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { StorageKeyError, StorageObjectNotFoundError } from '../shared/index';
import type { Readable } from 'node:stream';
import type { IStorageProvider } from '../shared/index';

export interface StorageContractHarness
{
    /** 케이스마다 호출된다. 같은 백엔드를 공유해도 되고 매번 새로 만들어도 된다. */
    createProvider(): IStorageProvider | Promise<IStorageProvider>;
    /** 이 실행이 쓸 키 루트. 실버킷에서는 실행마다 다른 값을 줘야 잔재와 겹치지 않는다. */
    root: string;
}

/** 어느 provider에도 닿기 전에 거부돼야 하는 키 — traversal·절대경로·URL·제어문자. */
const INVALID_KEYS = [
    '',
    '../secret.txt',
    'gen/../../etc/passwd',
    '/absolute.txt',
    'gen//double.txt',
    'gen/./same.txt',
    'gen/trailing/',
    'gen\\windows.txt',
    'https://cdn.example.com/card.webp',
    '//cdn.example.com/card.webp',
    `gen/nul${String.fromCharCode(0)}.txt`,
    `gen/newline${String.fromCharCode(10)}.txt`,
];

/**
 * 실버킷 provider 등록. 필수 env가 전부 있으면 계약을 돌리고, 하나도 없으면 비활성으로 둔다.
 * 일부만 설정된 상태는 조용히 건너뛰지 않고 실패한다 — env 이름 오타 하나로 실버킷 검증이
 * 통째로 사라지는 것을 막는다. 로컬 계약은 gate가 없어 언제나 돈다.
 */
export function registerOptInStorageProviderContract(
    name: string,
    requiredEnv: string[],
    createHarness: () => StorageContractHarness,
): void
{
    const present = requiredEnv.filter(key => (process.env[key] ?? '').length > 0);
    if (present.length === requiredEnv.length)
    {
        registerStorageProviderContract(name, createHarness());

        return;
    }

    describe(`${name} provider contract (opt-in, not configured)`, () =>
    {
        it('is either fully configured or fully unset', () =>
        {
            expect(present, `partial config — set all of ${requiredEnv.join(', ')} to run this contract`).toEqual([]);
        });
    });
}

export function registerStorageProviderContract(name: string, harness: StorageContractHarness): void
{
    describe(`${name} provider contract`, () =>
    {
        let storage: IStorageProvider;
        let root: string;

        beforeEach(async (context: { task: { name: string } }) =>
        {
            storage = await harness.createProvider();
            root = `${harness.root}/${slug(context.task.name)}`;
        });

        it('round-trips bytes through upload and download', async () =>
        {
            await storage.upload(`${root}/a.txt`, 'candidate-bytes', 'text/plain');

            expect((await storage.download(`${root}/a.txt`)).toString()).toBe('candidate-bytes');
        });

        it('round-trips bytes through upload and getStream', async () =>
        {
            await storage.upload(`${root}/a.txt`, 'streamed-bytes', 'text/plain');

            expect((await readAll(await storage.getStream(`${root}/a.txt`))).toString()).toBe('streamed-bytes');
        });

        it('streams an empty object without hanging', async () =>
        {
            await storage.upload(`${root}/empty.txt`, '', 'text/plain');

            expect((await readAll(await storage.getStream(`${root}/empty.txt`))).length).toBe(0);
        });

        it('rejects a missing key on download and getStream with the same contract error', async () =>
        {
            await expect(storage.download(`${root}/missing.txt`)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
            await expect(storage.getStream(`${root}/missing.txt`)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
        });

        it('copies to a new key and preserves the source', async () =>
        {
            await storage.upload(`${root}/candidate.txt`, 'picked', 'text/plain');

            await storage.copy(`${root}/candidate.txt`, `${root}/confirmed/asset.txt`);

            expect((await storage.download(`${root}/confirmed/asset.txt`)).toString()).toBe('picked');
            expect((await storage.download(`${root}/candidate.txt`)).toString()).toBe('picked');
        });

        it('copies a key holding reserved URL characters', async () =>
        {
            const source = `${root}/req 1/a+b?c#d.png`;
            await storage.upload(source, 'reserved', 'image/png');

            await storage.copy(source, `${root}/confirmed/a+b?c#d.png`);

            expect((await storage.download(`${root}/confirmed/a+b?c#d.png`)).toString()).toBe('reserved');
            expect((await storage.download(source)).toString()).toBe('reserved');
        });

        it('overwrites an existing destination on copy', async () =>
        {
            await storage.upload(`${root}/source.txt`, 'new', 'text/plain');
            await storage.upload(`${root}/target.txt`, 'old', 'text/plain');

            await storage.copy(`${root}/source.txt`, `${root}/target.txt`);

            expect((await storage.download(`${root}/target.txt`)).toString()).toBe('new');
        });

        it('rejects a missing copy source and leaves the destination absent', async () =>
        {
            await expect(storage.copy(`${root}/missing.txt`, `${root}/target.txt`))
                .rejects.toBeInstanceOf(StorageObjectNotFoundError);
            await expect(storage.download(`${root}/target.txt`)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
        });

        it('lists only objects under the prefix path boundary', async () =>
        {
            await storage.upload(`${root}/req-1/a.txt`, 'a', 'text/plain');
            await storage.upload(`${root}/req-1/nested/b.txt`, 'b', 'text/plain');
            await storage.upload(`${root}/req-10/c.txt`, 'c', 'text/plain');

            const listed = await storage.list(`${root}/req-1`);

            expect(listed.objects.map(object => object.key).sort()).toEqual([
                `${root}/req-1/a.txt`,
                `${root}/req-1/nested/b.txt`,
            ]);
            expect(listed.cursor).toBeUndefined();
        });

        it('reports a size for each listed object', async () =>
        {
            await storage.upload(`${root}/sized/a.txt`, 'twelve bytes', 'text/plain');

            const [object] = (await storage.list(`${root}/sized`)).objects;

            expect(object.size).toBe(12);
        });

        it('returns an empty page for a prefix with no objects', async () =>
        {
            const listed = await storage.list(`${root}/nothing-here`);

            expect(listed).toEqual({ objects: [] });
        });

        it('paginates with maxKeys and a cursor, covering every key exactly once', async () =>
        {
            const expected = ['0', '1', '2', '3', '4'].map(index => `${root}/page/${index}.txt`);
            for (const key of expected)
            {
                await storage.upload(key, key, 'text/plain');
            }

            const seen: string[] = [];
            let cursor: string | undefined;
            let pages = 0;
            do
            {
                const listed = await storage.list(`${root}/page`, { maxKeys: 2, ...(cursor ? { cursor } : {}) });
                seen.push(...listed.objects.map(object => object.key));
                cursor = listed.cursor;
                pages += 1;
                expect(pages).toBeLessThanOrEqual(expected.length + 1);
            }
            while (cursor);

            expect(seen.sort()).toEqual(expected);
        });

        it('deletes every object under a prefix and leaves a sibling prefix intact', async () =>
        {
            await storage.upload(`${root}/req-1/a.txt`, 'a', 'text/plain');
            await storage.upload(`${root}/req-1/nested/b.txt`, 'b', 'text/plain');
            await storage.upload(`${root}/req-10/c.txt`, 'c', 'text/plain');

            expect(await storage.deletePrefix(`${root}/req-1`)).toEqual({ deleted: 2, failed: [] });

            await expect(storage.download(`${root}/req-1/a.txt`)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
            await expect(storage.download(`${root}/req-1/nested/b.txt`)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
            expect((await storage.download(`${root}/req-10/c.txt`)).toString()).toBe('c');
        });

        it('succeeds with no deletions on a prefix that holds nothing', async () =>
        {
            expect(await storage.deletePrefix(`${root}/never-used`)).toEqual({ deleted: 0, failed: [] });
        });

        it('deletes exactly one key and leaves its siblings', async () =>
        {
            await storage.upload(`${root}/pair/a.txt`, 'a', 'text/plain');
            await storage.upload(`${root}/pair/b.txt`, 'b', 'text/plain');

            await storage.delete(`${root}/pair/a.txt`);

            await expect(storage.download(`${root}/pair/a.txt`)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
            expect((await storage.download(`${root}/pair/b.txt`)).toString()).toBe('b');
        });

        it('treats deleting a missing key as success', async () =>
        {
            await expect(storage.delete(`${root}/never-existed.txt`)).resolves.toBeUndefined();
        });

        it('rejects invalid keys on every object operation before reaching the provider', async () =>
        {
            for (const key of INVALID_KEYS)
            {
                await expect(storage.upload(key, 'x', 'text/plain'), key).rejects.toBeInstanceOf(StorageKeyError);
                await expect(storage.download(key), key).rejects.toBeInstanceOf(StorageKeyError);
                await expect(storage.getStream(key), key).rejects.toBeInstanceOf(StorageKeyError);
                await expect(storage.delete(key), key).rejects.toBeInstanceOf(StorageKeyError);
                await expect(storage.copy(key, `${root}/target.txt`), key).rejects.toBeInstanceOf(StorageKeyError);
                await expect(storage.copy(`${root}/source.txt`, key), key).rejects.toBeInstanceOf(StorageKeyError);
                await expect(storage.list(key), key).rejects.toBeInstanceOf(StorageKeyError);
                await expect(storage.deletePrefix(key), key).rejects.toBeInstanceOf(StorageKeyError);
            }
        });

        it('never lets an empty or root prefix mean the whole bucket', async () =>
        {
            await storage.upload(`${root}/survivor.txt`, 'keep', 'text/plain');

            for (const prefix of ['', '/', '//', '.', '..'])
            {
                await expect(storage.deletePrefix(prefix), prefix).rejects.toBeInstanceOf(StorageKeyError);
                await expect(storage.list(prefix), prefix).rejects.toBeInstanceOf(StorageKeyError);
            }

            expect((await storage.download(`${root}/survivor.txt`)).toString()).toBe('keep');
        });

        it('rejects a non-positive maxKeys instead of listing everything', async () =>
        {
            await expect(storage.list(`${root}/page`, { maxKeys: 0 })).rejects.toBeInstanceOf(StorageKeyError);
            await expect(storage.list(`${root}/page`, { maxKeys: 1.5 })).rejects.toBeInstanceOf(StorageKeyError);
        });

        it('lets a caller destroy a stream it never consumes', async () =>
        {
            await storage.upload(`${root}/big.txt`, 'x'.repeat(256 * 1024), 'text/plain');
            const stream = await storage.getStream(`${root}/big.txt`);

            stream.destroy();

            await expect(closed(stream)).resolves.toBe('closed');
        });
    });
}

async function readAll(stream: Readable): Promise<Buffer>
{
    const chunks: Buffer[] = [];
    for await (const chunk of stream)
    {
        chunks.push(Buffer.from(chunk as Buffer));
    }

    return Buffer.concat(chunks);
}

function closed(stream: Readable): Promise<string>
{
    return new Promise((resolve, reject) =>
    {
        stream.once('close', () => resolve('closed'));
        stream.once('error', reject);
    });
}

function slug(testName: string): string
{
    return testName.toLowerCase().replace(/[^a-z\d]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
