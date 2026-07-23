import { createMcpDispatcher } from '@spfn/mcp/dispatcher';
import { serveMcpStdio } from '@spfn/mcp/stdio';
import {
    createLocalDaemonClient,
    type LocalDaemonClient,
} from './local-daemon-client';

type LocalAuthority = {
    transport: 'stdio';
};

const daemonUrl = new URL(
    process.env.LOCAL_DAEMON_URL ?? 'http://127.0.0.1:47831',
);
const daemonClient = createLocalDaemonClient(daemonUrl);
const dispatcher = createMcpDispatcher<LocalAuthority, LocalDaemonClient>({
    serverInfo: { name: 'local-workspace', version: '1.0.0' },
    listTools: () => [{
        name: 'greet',
        description: 'Ask the already-running local daemon for a greeting.',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
        },
        handler: async (args, daemon) => daemon.greet(String(args.name)),
    }],
});

const bridge = serveMcpStdio({
    dispatcher,
    createSession: () => ({
        auth: { transport: 'stdio' },
        ctx: daemonClient,
    }),
});

await bridge.closed;
