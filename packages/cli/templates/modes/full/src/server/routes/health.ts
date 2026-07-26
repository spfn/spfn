import { route } from '@spfn/core/route';

export const getHealth = route.get('/health')
    .skip(['auth'])
    .handler(async () => ({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
    }));
