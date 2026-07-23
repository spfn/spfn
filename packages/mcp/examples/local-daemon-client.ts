export type LocalDaemonClient = {
    greet: (name: string) => Promise<{ greeting: string }>;
};

export function createLocalDaemonClient(baseUrl: URL): LocalDaemonClient
{
    return {
        greet: async name =>
        {
            const response = await fetch(new URL('/rpc/greet', baseUrl), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!response.ok)
            {
                throw new Error('Local daemon request failed');
            }

            return response.json() as Promise<{ greeting: string }>;
        },
    };
}
