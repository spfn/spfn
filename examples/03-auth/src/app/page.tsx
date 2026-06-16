import { api } from '@/lib/api-client';
import { getSession } from '@spfn/auth/nextjs/server';

// Reads the session cookie per-request — must be dynamic.
export const dynamic = 'force-dynamic';

type ListResult = Awaited<ReturnType<typeof api.listExamples.call>>;

export default async function Home()
{
    // getSession() is read-only and safe in a Server Component.
    const session = await getSession();

    let result: ListResult | null = null;
    let error: string | null = null;

    try
    {
        // listExamples is public (.skip(['auth'])), so it works without a session.
        result = await api.listExamples.call({ query: { limit: 10 } });
    }
    catch
    {
        error = 'Could not reach the SPFN API server. Run `docker compose up -d` and `pnpm spfn:dev`.';
    }

    const examples = result?.examples ?? [];

    return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>SPFN — Auth</h1>

            <section
                style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', border: '1px solid #e5e5e5', borderRadius: 8 }}
            >
                {session
                    ? (
                        <p style={{ margin: 0 }}>
                            ✅ Signed in as user <strong>{session.userId}</strong>. Protected routes
                            (e.g. <code>api.getMe</code>) and <code>POST /examples</code> now work.
                        </p>
                    )
                    : (
                        <p style={{ margin: 0, color: '#666' }}>
                            Not signed in. Register/login via <code>authApi.register</code> /{' '}
                            <code>authApi.login</code> — then writes and <code>api.getMe</code> become available.
                        </p>
                    )}
            </section>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '2rem' }}>Examples (public read)</h2>
            {error
                ? (
                    <p style={{ color: '#dc2626' }}>{error}</p>
                )
                : examples.length === 0
                    ? (
                        <p style={{ color: '#999' }}>No rows yet.</p>
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
        </main>
    );
}
