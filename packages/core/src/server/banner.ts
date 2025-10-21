/**
 * Server Startup Banner
 *
 * Displays SPFN logo and server information at startup.
 */

import { networkInterfaces } from 'os';

/**
 * Get local network IP address
 */
function getNetworkAddress(): string | null
{
    const nets = networkInterfaces();

    for (const name of Object.keys(nets))
    {
        const netGroup = nets[name];
        if (!netGroup) continue;

        for (const net of netGroup)
        {
            // IPv4, non-internal address
            if (net.family === 'IPv4' && !net.internal)
            {
                return net.address;
            }
        }
    }

    return null;
}

/**
 * Print server startup banner
 */
export function printBanner(options: {
    mode: string;
    host: string;
    port: number;
}): void
{
    const { mode, host, port } = options;

    console.log('');
    console.log('      _____ ____  ______ _   _');
    console.log('     / ____|  _ \\|  ____| \\ | |');
    console.log('    | (___ | |_) | |__  |  \\| |');
    console.log('     \\___ \\|  __/|  __| | . ` |');
    console.log('     ____) | |   | |    | |\\  |');
    console.log('    |_____/|_|   |_|    |_| \\_|');
    console.log('');
    console.log(`    Mode: ${mode}`);

    // Show Local and Network addresses like Next.js
    if (host === '0.0.0.0')
    {
        const networkIP = getNetworkAddress();
        console.log(`   ▲ Local:        http://localhost:${port}`);
        if (networkIP)
        {
            console.log(`   ▲ Network:      http://${networkIP}:${port}`);
        }
    }
    else
    {
        console.log(`   ▲ Local:        http://${host}:${port}`);
    }

    console.log('');
}
