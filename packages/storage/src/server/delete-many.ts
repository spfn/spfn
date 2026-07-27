import type { DeleteManyResult } from '../shared/index';

export async function deleteManyIndividually(
    keys: string[],
    deleteObject: (key: string) => Promise<void>,
): Promise<DeleteManyResult>
{
    const results = await Promise.all(keys.map(async key =>
    {
        try
        {
            await deleteObject(key);

            return { key, error: null };
        }
        catch (error)
        {
            return { key, error: errorMessage(error) };
        }
    }));

    return {
        deleted: results.filter(result => result.error === null).map(result => result.key),
        failed: results
            .filter((result): result is { key: string; error: string } => result.error !== null)
            .map(result => ({ key: result.key, error: result.error })),
    };
}

export function errorMessage(error: unknown): string
{
    return error instanceof Error ? error.message : String(error);
}
