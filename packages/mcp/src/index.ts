export type McpProtocolEra = 'legacy' | 'modern';

export type McpObjectSchema = {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
};

export type McpIcon = {
    src: string;
    mimeType?: string;
    sizes?: string[];
    theme?: 'light' | 'dark';
};

export type McpServerInfo = {
    name: string;
    version: string;
    title?: string;
    description?: string;
    websiteUrl?: string;
    icons?: McpIcon[];
};

export type McpAuth = {
    clientId: string;
    scopes: string[];
    expiresAt?: number;
};

export type McpRequestInfo = {
    era: McpProtocolEra;
    requestId: string;
    request: Request;
};

export type McpToolAnnotations = {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
};

export type McpTool<Ctx> = {
    name: string;
    title?: string;
    description?: string;
    inputSchema: McpObjectSchema;
    outputSchema?: McpObjectSchema;
    annotations?: McpToolAnnotations;
    icons?: McpIcon[];
    handler: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
};

export type McpResourceDefinition = {
    uri: string;
    name: string;
    title?: string;
    description?: string;
    mimeType?: string;
    icons?: McpIcon[];
};

export type McpTextResourceContent = {
    uri: string;
    mimeType?: string;
    text: string;
};

export type McpBlobResourceContent = {
    uri: string;
    mimeType?: string;
    blob: string;
};

export type McpResourceResult = {
    contents: (McpTextResourceContent | McpBlobResourceContent)[];
};

export type McpPromptArgument = {
    name: string;
    description?: string;
    required?: boolean;
};

export type McpPromptDefinition = {
    name: string;
    title?: string;
    description?: string;
    arguments?: McpPromptArgument[];
    icons?: McpIcon[];
};

export type McpPromptMessage = {
    role: 'user' | 'assistant';
    content: {
        type: 'text';
        text: string;
    };
};

export type McpPromptResult = {
    description?: string;
    messages: McpPromptMessage[];
};

export type McpToolCallEvent<Auth, Ctx> = {
    toolName: string;
    auth: Auth;
    requestId: string;
    ok: boolean;
    ctx: Ctx;
};

export type McpErrorEvent = {
    operation: 'context' | 'tool' | 'resource' | 'prompt' | 'transport';
    name?: string;
    error: unknown;
};

export type McpRouteConfig<Auth extends McpAuth, Ctx> = {
    appUrl: string;
    serverInfo: McpServerInfo;
    resource?: string | ((appUrl: string) => string);
    resourceMetadataUrl?: string;
    validateToken: (token: string, resource: string) => Promise<Auth>;
    resolveContext: (auth: Auth, request: McpRequestInfo) => Promise<Ctx>;
    listTools: (ctx: Ctx) => McpTool<Ctx>[] | Promise<McpTool<Ctx>[]>;
    resources?: {
        list: (ctx: Ctx) => McpResourceDefinition[] | Promise<McpResourceDefinition[]>;
        read: (ctx: Ctx, uri: string) => Promise<McpResourceResult>;
    };
    prompts?: {
        list: (ctx: Ctx) => McpPromptDefinition[] | Promise<McpPromptDefinition[]>;
        get: (ctx: Ctx, name: string, args: Record<string, string>) => Promise<McpPromptResult>;
    };
    security?: {
        allowedHosts?: string[];
        allowedOrigins?: string[];
    };
    responseMode?: 'auto' | 'sse' | 'json';
    onToolCall?: (event: McpToolCallEvent<Auth, Ctx>) => void | Promise<void>;
    onError?: (event: McpErrorEvent) => void | Promise<void>;
};

export class McpError extends Error
{
    readonly code: number;
    readonly httpStatus?: number;

    constructor(code: number, message: string, httpStatus?: number)
    {
        super(message);
        this.name = 'McpError';
        this.code = code;
        this.httpStatus = httpStatus;
    }
}
