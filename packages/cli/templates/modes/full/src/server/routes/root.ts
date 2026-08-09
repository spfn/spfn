import { route } from '@spfn/core/route';

export const getRoot = route.get('/')
    .skip(['auth'])
    .handler(async () => ({
        name: 'SPFN API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/_core/health',
            examples: '/examples',
            auth: '/_auth',
            ops: '/_ops',
        },
    }));
