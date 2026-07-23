import type {
    McpDispatcher,
    McpDispatcherConfig,
} from './index';

const DISPATCHER_CONFIG = Symbol.for('@spfn/mcp.dispatcher.config');

type InternalDispatcher<Auth, Ctx> = McpDispatcher<Auth, Ctx> & {
    [DISPATCHER_CONFIG]: McpDispatcherConfig<Auth, Ctx>;
};

export function createMcpDispatcher<Auth, Ctx>(
    config: McpDispatcherConfig<Auth, Ctx>,
): McpDispatcher<Auth, Ctx>
{
    const dispatcher = { serverInfo: config.serverInfo };
    Object.defineProperty(dispatcher, DISPATCHER_CONFIG, {
        value: config,
        enumerable: false,
        writable: false,
        configurable: false,
    });

    return Object.freeze(dispatcher) as McpDispatcher<Auth, Ctx>;
}

export function dispatcherConfig<Auth, Ctx>(
    dispatcher: McpDispatcher<Auth, Ctx>,
): McpDispatcherConfig<Auth, Ctx>
{
    const internal = dispatcher as Partial<InternalDispatcher<Auth, Ctx>>;
    if (!(DISPATCHER_CONFIG in internal))
    {
        throw new Error('Invalid SPFN MCP dispatcher');
    }

    return internal[DISPATCHER_CONFIG]!;
}
