'use client';

import { authApi } from '@spfn/auth';
import { useState } from 'react';

/**
 * Email + password login form.
 *
 * `authApi.login` goes through the RPC proxy, where the auth interceptor
 * (`@spfn/auth/nextjs/api`) generates a signing key pair and saves the encrypted
 * session cookie on success — the form itself never touches keys or cookies.
 * A full navigation (not router.push) follows so Server Components re-read the
 * fresh session.
 */
export function LoginForm({ redirectTo = '/dashboard' }: { redirectTo?: string })
{
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: React.FormEvent)
    {
        event.preventDefault();
        setPending(true);
        setError(null);

        try
        {
            await authApi.login.call({ body: { email, password } });
            window.location.assign(redirectTo);
        }
        catch
        {
            setError('Sign-in failed. Check the email and password (seeded admin: see .env.server).');
            setPending(false);
        }
    }

    return (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                Email
                <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    style={{ padding: '0.5rem 0.75rem', border: '1px solid #d4d4d4', borderRadius: 6 }}
                />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                Password
                <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    style={{ padding: '0.5rem 0.75rem', border: '1px solid #d4d4d4', borderRadius: 6 }}
                />
            </label>
            {error && <p style={{ margin: 0, color: '#dc2626', fontSize: '0.875rem' }}>{error}</p>}
            <button
                type="submit"
                disabled={pending}
                style={{ padding: '0.6rem 0.75rem', cursor: 'pointer', fontWeight: 600 }}
            >
                {pending ? 'Signing in...' : 'Sign in'}
            </button>
        </form>
    );
}
