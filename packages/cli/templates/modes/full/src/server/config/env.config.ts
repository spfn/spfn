import {
    createEnvRegistry,
    defineEnvSchema,
    envSecret,
    envUrl,
} from '@spfn/core/env';

export const envSchema = defineEnvSchema({
    SPFN_MCP_URL: envUrl({
        description: 'Public base URL of the SPFN server that exposes /mcp',
        default: 'http://localhost:8790',
        required: false,
    }),
    SPFN_MCP_API_KEY: envSecret({
        description: 'First-party Bearer token for the generated MCP operator endpoint',
        required: true,
        generate: 'base64url32',
    }),
});

export const env = createEnvRegistry(envSchema).validate();

export default env;
