'use client';

import { useState } from 'react';
import { authApi } from '@spfn/auth';
import { I18nProvider, useT } from '@spfn/i18n/client';
import { catalogs } from '@/i18n/catalogs';

const providers = ['google', 'github', 'kakao', 'naver'] as const;

export default function LoginPage()
{
    return (
        <I18nProvider locale="en" messages={catalogs.en ?? {}}>
            <LoginContent />
        </I18nProvider>
    );
}

function LoginContent()
{
    const [error, setError] = useState<string>();
    const [pending, setPending] = useState<string>();
    const t = useT('common');

    async function signIn(provider: typeof providers[number]): Promise<void>
    {
        setError(undefined);
        setPending(provider);

        try
        {
            const { authUrl } = provider === 'google'
                ? await authApi.getGoogleOAuthUrl.call({ body: { returnUrl: '/' } })
                : await authApi.getProviderOAuthUrl.call({
                    params: { provider },
                    body: { returnUrl: '/' },
                });

            window.location.assign(authUrl);
        }
        catch (cause)
        {
            setPending(undefined);
            setError(cause instanceof Error ? cause.message : 'Could not start sign in');
        }
    }

    return (
        <main style={{ maxWidth: 420, margin: '10vh auto', padding: 24 }}>
            <h1>{t('appName')} — Sign in</h1>
            <p>Connect a provider key in <code>.env.server</code>, then continue.</p>
            <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
                {providers.map(provider => (
                    <button
                        key={provider}
                        type="button"
                        disabled={pending !== undefined}
                        onClick={() => void signIn(provider)}
                        style={{ padding: 12, textTransform: 'capitalize' }}
                    >
                        {pending === provider ? 'Connecting…' : `Continue with ${provider}`}
                    </button>
                ))}
            </div>
            {error ? <p role="alert">{error}</p> : null}
        </main>
    );
}
