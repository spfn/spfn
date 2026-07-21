import Link from 'next/link';
import { getUserRole } from '@spfn/auth/nextjs/server';

export const dynamic = 'force-dynamic';

/** Admin-only screen — reachable with the account seeded via SPFN_AUTH_ADMIN_EMAIL. */
export default async function AdminPage()
{
    const role = await getUserRole();

    return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '5rem 1.5rem', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Admin</h1>

            <section style={{ marginTop: '1.5rem', padding: '1.25rem', border: '1px solid #e5e5e5', borderRadius: 8 }}>
                <p style={{ margin: 0 }}>
                    🔐 You are here because <code>RequireRole roles=[&apos;admin&apos;, &apos;superadmin&apos;]</code> let
                    you through (your role: <code>{role}</code>).
                </p>
            </section>

            <p style={{ marginTop: '1.5rem', color: '#666' }}>
                <Link href="/dashboard">← Dashboard</Link>
            </p>
        </main>
    );
}
