import { appMetadata } from "@spfn/cms/server";
import { createApi } from "@spfn/core/nextjs";
import { errorRegistry } from "@spfn/core/errors";
import type { AppRouter } from '../server/routes/index';

export const api = createApi<AppRouter>({
    metadata: appMetadata,
    errorRegistry: errorRegistry
});