import Link from 'next/link';

interface OAuthErrorPageProps
{
    searchParams: Promise<{ error?: string }>;
}

export default async function OAuthErrorPage({ searchParams }: OAuthErrorPageProps)
{
    const { error } = await searchParams;

    return (
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '5rem 1.5rem' }}>
            <h1>OAuth login failed</h1>
            <p style={{ color: '#b91c1c' }}>{error || 'The provider did not complete authentication.'}</p>
            <Link href="/">Return to the auth example</Link>
        </main>
    );
}
