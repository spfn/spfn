'use client';

import { authApi } from '@spfn/auth';
import { useState } from 'react';

export function LogoutButton()
{
    const [pending, setPending] = useState(false);

    async function logout()
    {
        setPending(true);
        try
        {
            await authApi.logout.call({});
            window.location.reload();
        }
        catch
        {
            setPending(false);
        }
    }

    return (
        <button
            type="button"
            disabled={pending}
            onClick={logout}
            style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', cursor: 'pointer' }}
        >
            {pending ? 'Signing out...' : 'Sign out'}
        </button>
    );
}
