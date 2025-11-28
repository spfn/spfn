import { createApi } from "@spfn/core/nextjs";
import { errorRegistry } from "@spfn/core/errors";
import { type AppRouter, appMetadata } from "@spfn/cms/server";

export const api = createApi<AppRouter>({
    metadata: appMetadata,
    errorRegistry: errorRegistry
});