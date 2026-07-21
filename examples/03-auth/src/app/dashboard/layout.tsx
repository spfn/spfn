import { RequireAuth } from '@spfn/auth/nextjs/server';
import type { ReactNode } from 'react';

/**
 * Everything under /dashboard requires a signed-in user. The guard lives in the
 * layout, so every nested page and layout inherits it — no per-page checks.
 */
export default function DashboardLayout({ children }: { children: ReactNode })
{
    return <RequireAuth redirectTo="/login">{children}</RequireAuth>;
}
