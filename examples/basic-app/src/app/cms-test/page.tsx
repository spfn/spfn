/**
 * CMS Integration Test Page
 *
 * Demonstrates @spfn/cms package integration with RPC proxy
 */

import { getLabel, getLabels, format } from '@/lib/labels';

export default async function CmsTestPage()
{
    // Note: This will try to call the backend via RPC proxy
    // If backend is not running, it will show fallback values from labelsDefinition

    let homeLabels: any = null;
    let allLabels: any = null;
    let error: string | null = null;

    try
    {
        // Single section
        homeLabels = await getLabel('home');

        // Multiple sections
        allLabels = await getLabels(['home', 'about']);
    }
    catch (e)
    {
        error = e instanceof Error ? e.message : 'Unknown error';
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-8">CMS Integration Test</h1>

                <p className="text-zinc-600 dark:text-zinc-400 mb-8">
                    This page demonstrates @spfn/cms package integration with the RPC proxy.
                    The CMS client calls are routed through /api/rpc/[routeName] to the backend.
                </p>

                {error ? (
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
                        <h2 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">
                            Backend Connection Error
                        </h2>
                        <p className="text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </p>
                        <p className="text-zinc-500 text-sm mt-2">
                            Make sure the SPFN backend server is running (pnpm spfn:dev)
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Single Section Example */}
                        <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 border border-zinc-200 dark:border-zinc-800 mb-6">
                            <h2 className="text-xl font-semibold mb-4">
                                getLabel('home') - Single Section
                            </h2>
                            <pre className="text-sm font-mono bg-zinc-100 dark:bg-zinc-800 p-4 rounded overflow-x-auto">
                                {JSON.stringify(homeLabels, null, 2)}
                            </pre>
                        </div>

                        {/* Multiple Sections Example */}
                        <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 border border-zinc-200 dark:border-zinc-800 mb-6">
                            <h2 className="text-xl font-semibold mb-4">
                                getLabels(['home', 'about']) - Multiple Sections
                            </h2>
                            <pre className="text-sm font-mono bg-zinc-100 dark:bg-zinc-800 p-4 rounded overflow-x-auto">
                                {JSON.stringify(allLabels, null, 2)}
                            </pre>
                        </div>

                        {/* Usage Example */}
                        <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-6">
                            <h2 className="text-xl font-semibold mb-4">Usage in Components</h2>
                            <div className="space-y-2 text-sm">
                                <p><code className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">homeLabels.hero.title</code> → {homeLabels?.hero?.title || 'N/A'}</p>
                                <p><code className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">allLabels.about.title</code> → {allLabels?.about?.title || 'N/A'}</p>
                            </div>
                        </div>
                    </>
                )}

                <div className="mt-8 p-4 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
                    <h3 className="font-semibold mb-2">How it works:</h3>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                        <li>CMS client calls <code>api.getLabelCache.call()</code></li>
                        <li>Request goes to <code>/api/rpc/getLabelCache</code></li>
                        <li>RPC proxy finds route in <code>cmsAppRouter</code> (packages option)</li>
                        <li>Forwards to backend: <code>GET /_cms/labels/cache</code></li>
                        <li>Returns cached labels merged with defaults</li>
                    </ol>
                </div>
            </div>
        </div>
    );
}