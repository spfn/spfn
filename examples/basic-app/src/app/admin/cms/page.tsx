/**
 * CMS Admin Page
 *
 * Manage labels by section with table view
 */

import { RequireAuth } from '@spfn/auth/nextjs/server';
import { CmsLabelManager } from './_components/cms-label-manager';
import { labelConfig } from '@/lib/labels';

export default async function CmsAdminPage()
{
    return (
        <RequireAuth redirectTo="/auth/login?redirect=/admin/cms">
            <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold">CMS Label Manager</h1>
                        <p className="text-zinc-600 dark:text-zinc-400 mt-2">
                            Manage labels by section. Edit values and publish changes.
                        </p>
                    </div>

                    <CmsLabelManager
                        locales={labelConfig.locales as unknown as string[]}
                        defaultLocale={labelConfig.defaultLocale}
                    />
                </div>
            </div>
        </RequireAuth>
    );
}
