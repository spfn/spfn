/**
 * resolveWSServerCtor tests — ws dual-package interop (issue #16)
 *
 * ws exposes a different module shape per loader path. The ESM wrapper
 * (exports.import → wrapper.mjs) only provides WebSocketServer as a named
 * export while its default export is the bare WebSocket class, so resolving
 * .default first crashes prod ESM servers even with ws@8 installed. These
 * tests pin both shapes so the resolution order cannot regress.
 */

import { describe, it, expect } from 'vitest';
import { resolveWSServerCtor } from '../handler';

class FakeWebSocket
{
}

class FakeWebSocketServer
{
}

describe('resolveWSServerCtor (ws dual-package interop)', () =>
{
    it('resolves the named export on the ESM wrapper shape (default has no properties)', () =>
    {
        // wrapper.mjs: default = WebSocket class, WebSocketServer only as named export
        const mod = {
            default: FakeWebSocket,
            WebSocket: FakeWebSocket,
            WebSocketServer: FakeWebSocketServer,
            Server: FakeWebSocketServer,
        };

        expect(resolveWSServerCtor(mod)).toBe(FakeWebSocketServer);
    });

    it('falls back to default.WebSocketServer on the CJS interop shape', () =>
    {
        // require interop: module.exports = WebSocket with WebSocketServer attached
        class CjsWebSocket
        {
        }
        const cjsExports: any = CjsWebSocket;
        cjsExports.WebSocketServer = FakeWebSocketServer;
        cjsExports.Server = FakeWebSocketServer;

        const mod = { default: cjsExports };

        expect(resolveWSServerCtor(mod)).toBe(FakeWebSocketServer);
    });

    it('falls back to the legacy Server named export', () =>
    {
        const mod = { Server: FakeWebSocketServer };

        expect(resolveWSServerCtor(mod)).toBe(FakeWebSocketServer);
    });

    it('returns undefined when no server constructor exists in any shape', () =>
    {
        expect(resolveWSServerCtor({ default: FakeWebSocket })).toBeUndefined();
    });
});
