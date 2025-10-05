#!/usr/bin/env node

import('../dist/index.js').then(({ run }) =>
{
    run();
}).catch((error) =>
{
    console.error('Error:', error);
    process.exit(1);
});