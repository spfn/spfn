/**
 * @spfn/notification - Concurrency utility for bulk operations
 */

/**
 * Run async tasks with concurrency control using a worker pool pattern.
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Max concurrent tasks (default: 10)
 * @returns Results in the same order as input items
 */
export async function runWithConcurrency<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    concurrency = 10
): Promise<R[]>
{
    const results: R[] = new Array(items.length);
    let cursor = 0;

    async function worker(): Promise<void>
    {
        while (cursor < items.length)
        {
            const i = cursor++;
            results[i] = await fn(items[i]);
        }
    }

    const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => worker()
    );

    await Promise.all(workers);
    return results;
}
