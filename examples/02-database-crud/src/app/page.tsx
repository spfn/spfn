import { api } from '@/lib/api-client';

// Rendered per-request so the demo reads live rows instead of being baked at build time.
export const dynamic = 'force-dynamic';

// Types come straight from the API — no hand-written DTO to drift out of sync.
type ListResult = Awaited<ReturnType<typeof api.listExamples.call>>;

export default async function Home()
{
    let result: ListResult | null = null;
    let error: string | null = null;

    try
    {
        result = await api.listExamples.call({ query: { limit: 10 } });
    }
    catch
    {
        error = 'Could not reach the SPFN API server. Run `docker compose up -d` and `pnpm spfn:dev`, then reload.';
    }

    const examples = result?.examples ?? [];
    const total = result?.total ?? 0;

    return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>SPFN — Database CRUD</h1>
            <p style={{ color: '#666', lineHeight: 1.7 }}>
                A Server Component calling <code>api.listExamples.call(...)</code> — the typed
                client over an Entity → Repository → Route slice backed by Postgres.
            </p>

            {error
                ? (
                    <p style={{ marginTop: '2rem', color: '#dc2626' }}>{error}</p>
                )
                : (
                    <section style={{ marginTop: '2rem' }}>
                        <p style={{ color: '#666' }}>{total} example(s)</p>
                        {examples.length === 0
                            ? (
                                <p style={{ color: '#999' }}>
                                    No rows yet. Create one: <code>POST /examples</code> with a JSON body
                                    <code>&#123; name, description &#125;</code>.
                                </p>
                            )
                            : (
                                <ul style={{ listStyle: 'none', padding: 0 }}>
                                    {examples.map((ex) => (
                                        <li
                                            key={String(ex.id)}
                                            style={{ padding: '0.75rem 1rem', border: '1px solid #e5e5e5', borderRadius: 8, marginBottom: '0.5rem' }}
                                        >
                                            <strong>{ex.name}</strong>
                                            <span style={{ color: '#666' }}> — {ex.description}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                    </section>
                )}
        </main>
    );
}
