import { redirect } from 'next/navigation';
import { getSession } from '@spfn/auth/nextjs/server';
import { LoginForm } from '@/app/components/login-form';
import { OAuthLoginButtons } from '@/app/components/oauth-login-buttons';

export const dynamic = 'force-dynamic';

/**
 * /login — email/password for seeded accounts (admins), OAuth for everyone else.
 * Email/password *registration* is not shown here: it requires the verification-code
 * flow (`/_auth/verify-code`), which needs a mail/SMS provider.
 */
export default async function LoginPage()
{
    if (await getSession())
    {
        redirect('/dashboard');
    }

    return (
        <main style={{ maxWidth: 420, margin: '0 auto', padding: '5rem 1.5rem', fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Sign in</h1>

            <section style={{ marginTop: '1.5rem', padding: '1.25rem', border: '1px solid #e5e5e5', borderRadius: 8 }}>
                <LoginForm />
            </section>

            <section style={{ marginTop: '1rem', padding: '1.25rem', border: '1px solid #e5e5e5', borderRadius: 8 }}>
                <p style={{ margin: '0 0 0.75rem', color: '#666', fontSize: '0.875rem' }}>Or continue with a social account:</p>
                <OAuthLoginButtons />
            </section>
        </main>
    );
}
