import { api } from '@/lib/api-client';

// Rendered per-request so the demo calls the live API instead of being baked at build time.
export const dynamic = 'force-dynamic';

export default async function Home()
{
    let greeting: { message: string; framework: string } | null = null;
    let error: string | null = null;

    try
    {
        greeting = await api.getGreeting.call({ query: { name: 'SPFN' } });
    }
    catch
    {
        error = 'Could not reach the SPFN API server. Run `pnpm spfn:dev` and reload.';
    }

    return (
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '6rem 1.5rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>SPFN — Minimal API</h1>
            <p style={{ color: '#a1a1a1', lineHeight: 1.7 }}>
                This page is a Server Component. It calls{' '}
                <code>api.getGreeting.call(&#123;...&#125;)</code> — a fully typed client whose
                types come straight from the server router.
            </p>

            {greeting
                ? (
                    <pre
                        style={{
                            marginTop: '2rem',
                            padding: '1rem 1.25rem',
                            background: '#161616',
                            border: '1px solid #262626',
                            borderRadius: 8,
                            overflowX: 'auto',
                        }}
                    >
                        {JSON.stringify(greeting, null, 2)}
                    </pre>
                )
                : (
                    <p style={{ marginTop: '2rem', color: '#f87171' }}>{error}</p>
                )}
        </main>
    );
}
