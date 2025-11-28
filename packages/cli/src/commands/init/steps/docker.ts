import { existsSync } from 'fs';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';
import { findTemplatesPath } from '../utils/templates.js';

const { copySync } = fse;

/**
 * Copy Docker configuration files to project root
 * Includes docker-compose.yml, Dockerfile, .dockerignore, and docker-compose.production.yml
 */
export async function setupDockerFiles(cwd: string): Promise<void>
{
    const templatesDir = findTemplatesPath();

    // Copy docker-compose.yml (development)
    const dockerComposePath = join(cwd, 'docker-compose.yml');
    if (!existsSync(dockerComposePath))
    {
        try
        {
            const dockerComposeTemplate = join(templatesDir, 'docker-compose.yml');

            if (existsSync(dockerComposeTemplate))
            {
                copySync(dockerComposeTemplate, dockerComposePath);
                logger.success('Created docker-compose.yml (PostgreSQL + Redis)');
            }
        }
        catch (error)
        {
            // Not critical, continue without docker-compose.yml
            logger.warn('Could not copy docker-compose.yml');
        }
    }

    // Copy Docker production files
    try
    {
        // Copy Dockerfile
        const dockerfilePath = join(cwd, 'Dockerfile');
        if (!existsSync(dockerfilePath))
        {
            const dockerfileTemplate = join(templatesDir, 'Dockerfile');
            if (existsSync(dockerfileTemplate))
            {
                copySync(dockerfileTemplate, dockerfilePath);
                logger.success('Created Dockerfile');
            }
        }

        // Copy .dockerignore
        const dockerignorePath = join(cwd, '.dockerignore');
        if (!existsSync(dockerignorePath))
        {
            const dockerignoreTemplate = join(templatesDir, '.dockerignore');
            if (existsSync(dockerignoreTemplate))
            {
                copySync(dockerignoreTemplate, dockerignorePath);
                logger.success('Created .dockerignore');
            }
        }

        // Copy docker-compose.production.yml
        const dockerComposeProdPath = join(cwd, 'docker-compose.production.yml');
        if (!existsSync(dockerComposeProdPath))
        {
            const dockerComposeProdTemplate = join(templatesDir, 'docker-compose.production.yml');
            if (existsSync(dockerComposeProdTemplate))
            {
                copySync(dockerComposeProdTemplate, dockerComposeProdPath);
                logger.success('Created docker-compose.production.yml');
            }
        }
    }
    catch (error)
    {
        // Not critical, continue
        logger.warn('Could not copy Docker files (you can create them manually)');
    }
}