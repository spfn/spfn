import net from 'net';

/**
 * Parse DATABASE_URL into connection info
 */
export interface DbConnectionInfo
{
	host: string;
	port: string;
	user: string;
	password: string;
	database: string;
}

export function parseDatabaseUrl(dbUrl: string): DbConnectionInfo
{
	try
	{
		const url = new URL(dbUrl);
		return {
			host: url.hostname,
			port: url.port || '5432',
			user: url.username,
			password: url.password,
			database: url.pathname.slice(1), // Remove leading /
		};
	}
	catch (error)
	{
		throw new Error(`Invalid DATABASE_URL format: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean>
{
	return new Promise((resolve) =>
	{
		const server = net.createServer();

		server.once('error', () =>
		{
			server.close();
			resolve(false);
		});

		server.once('listening', () =>
		{
			server.close();
			resolve(true);
		});

		server.listen(port, '127.0.0.1');
	});
}

/**
 * Find an available port starting from the given port
 */
export async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number>
{
	for (let i = 0; i < maxAttempts; i++)
	{
		const port = startPort + i;
		if (await isPortAvailable(port))
		{
			return port;
		}
	}

	throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
}