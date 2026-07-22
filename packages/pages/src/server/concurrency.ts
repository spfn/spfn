/** Map items through an async task with bounded concurrency, preserving order. */
export async function mapConcurrent<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]>
{
    const results = new Array<R>(items.length);
    let next = 0;

    async function worker(): Promise<void>
    {
        while (next < items.length)
        {
            const index = next++;
            results[index] = await task(items[index]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));

    return results;
}
