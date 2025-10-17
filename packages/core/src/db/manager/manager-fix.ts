/**
 * INSTRUCTIONS: This is a reference implementation showing all the remaining fixes needed.
 *
 * The following functions still reference old module-level variables and need to be updated:
 * - closeDatabase() - lines 302-358
 * - getDatabaseInfo() - lines 361-374
 * - startHealthCheck() - lines 397-443
 * - attemptReconnection() - lines 448-502
 * - stopHealthCheck() - lines 515-525
 * - getDatabaseMonitoringConfig() - lines 545-548
 *
 * Replace all uses of:
 * - writeInstance → getWriteInstance()
 * - readInstance → getReadInstance()
 * - writeClient → getWriteClient()
 * - readClient → getReadClient()
 * - healthCheckInterval → getHealthCheckInterval()
 * - monitoringConfig → getMonitoringConfig()
 *
 * And for assignments, use:
 * - writeInstance = val → setWriteInstance(val)
 * - readInstance = val → setReadInstance(val)
 * - writeClient = val → setWriteClient(val)
 * - readClient = val → setReadClient(val)
 * - healthCheckInterval = val → setHealthCheckInterval(val)
 * - monitoringConfig = val → setMonitoringConfig(val)
 */

// Lines 302-358: closeDatabase
export async function closeDatabase(): Promise<void>
{
    const writeInst = getWriteInstance();
    const readInst = getReadInstance();

    if (!writeInst && !readInst)
    {
        dbLogger.debug('No database connections to close');
        return;
    }

    // Stop health check
    stopHealthCheck();

    try
    {
        const closePromises: Promise<void>[] = [];

        // Close write client
        const writeC = getWriteClient();
        if (writeC)
        {
            dbLogger.debug('Closing write connection...');
            closePromises.push(
                writeC.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Write connection closed'))
                    .catch(err => dbLogger.error('Error closing write connection', err))
            );
        }

        // Close read client (if different from write)
        const readC = getReadClient();
        if (readC && readC !== writeC)
        {
            dbLogger.debug('Closing read connection...');
            closePromises.push(
                readC.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Read connection closed'))
                    .catch(err => dbLogger.error('Error closing read connection', err))
            );
        }

        // Wait for all connections to close
        await Promise.all(closePromises);

        dbLogger.info('All database connections closed');
    }
    catch (error)
    {
        dbLogger.error('Error during database cleanup', error as Error);
        throw error;
    }
    finally
    {
        // Always clear instances
        setWriteInstance(undefined);
        setReadInstance(undefined);
        setWriteClient(undefined);
        setReadClient(undefined);
        setMonitoringConfig(undefined);
    }
}

// Lines 361-374: getDatabaseInfo
export function getDatabaseInfo(): {
    hasWrite: boolean;
    hasRead: boolean;
    isReplica: boolean;
}
{
    const writeInst = getWriteInstance();
    const readInst = getReadInstance();

    return {
        hasWrite: !!writeInst,
        hasRead: !!readInst,
        isReplica: !!(readInst && readInst !== writeInst),
    };
}

// Lines 397-443: startHealthCheck
export function startHealthCheck(config: HealthCheckConfig): void
{
    const healthCheck = getHealthCheckInterval();
    if (healthCheck)
    {
        dbLogger.debug('Health check already running');
        return;
    }

    dbLogger.info('Starting database health check', {
        interval: `${config.interval}ms`,
        reconnect: config.reconnect,
    });

    const interval = setInterval(async () =>
    {
        try
        {
            const write = getDatabase('write');
            const read = getDatabase('read');

            // Check write connection
            if (write)
            {
                await write.execute('SELECT 1');
            }

            // Check read connection (if different)
            if (read && read !== write)
            {
                await read.execute('SELECT 1');
            }

            dbLogger.debug('Database health check passed');
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error('Database health check failed', { error: message });

            // Attempt reconnection if enabled
            if (config.reconnect)
            {
                await attemptReconnection(config);
            }
        }
    }, config.interval);

    setHealthCheckInterval(interval);
}

// Lines 448-502: attemptReconnection
async function attemptReconnection(config: HealthCheckConfig): Promise<void>
{
    dbLogger.warn('Attempting database reconnection', {
        maxRetries: config.maxRetries,
        retryInterval: `${config.retryInterval}ms`,
    });

    for (let attempt = 1; attempt <= config.maxRetries; attempt++)
    {
        try
        {
            dbLogger.debug(`Reconnection attempt ${attempt}/${config.maxRetries}`);

            // Close existing connections
            await closeDatabase();

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, config.retryInterval));

            // Reinitialize database
            const result = await createDatabaseFromEnv();

            if (result.write)
            {
                // Test connection
                await result.write.execute('SELECT 1');

                // Store instances
                setWriteInstance(result.write);
                setReadInstance(result.read);
                setWriteClient(result.writeClient);
                setReadClient(result.readClient);

                dbLogger.info('Database reconnection successful', { attempt });
                return;
            }
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error(`Reconnection attempt ${attempt} failed`, {
                error: message,
                attempt,
                maxRetries: config.maxRetries,
            });

            if (attempt === config.maxRetries)
            {
                dbLogger.error('Max reconnection attempts reached, giving up');
            }
        }
    }
}

// Lines 515-525: stopHealthCheck
export function stopHealthCheck(): void
{
    const healthCheck = getHealthCheckInterval();
    if (healthCheck)
    {
        clearInterval(healthCheck);
        setHealthCheckInterval(undefined);
        dbLogger.info('Database health check stopped');
    }
}

// Lines 545-548: getDatabaseMonitoringConfig
export function getDatabaseMonitoringConfig(): MonitoringConfig | undefined
{
    return getMonitoringConfig();
}