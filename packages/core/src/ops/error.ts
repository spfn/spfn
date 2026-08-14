/** Thrown when a route or module cannot be part of an ops surface. */
export class OpsRouterError extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = 'OpsRouterError';
    }
}
