import { RequireRole } from '@spfn/auth/nextjs/server';
import type { ReactNode } from 'react';

/**
 * /admin is role-gated: the user must hold one of the listed roles (OR match,
 * exact names — `superadmin` does not imply `admin`). Signed-in users without a
 * matching role are redirected to /dashboard instead of the default
 * /unauthorized page. The account seeded via SPFN_AUTH_ADMIN_EMAIL gets the
 * `superadmin` role.
 */
export default function AdminLayout({ children }: { children: ReactNode })
{
    return <RequireRole roles={['admin', 'superadmin']} redirectTo="/dashboard">{children}</RequireRole>;
}
