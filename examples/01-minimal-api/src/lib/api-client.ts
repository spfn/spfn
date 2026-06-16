/**
 * API Client
 *
 * `createApi<AppRouter>()` returns a fully type-safe client. Route names, inputs,
 * and return types all come from the server's AppRouter type — no codegen import,
 * no manual types. Route resolution happens at the /api/rpc proxy layer.
 */

import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

export const api = createApi<AppRouter>();
