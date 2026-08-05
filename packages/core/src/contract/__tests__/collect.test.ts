import { describe, it, expect } from 'vitest';
import { Type } from '@sinclair/typebox';
import { route } from '../../route/route-builder';
import { defineRouter } from '../../route/router';
import { collectContractDocument, ContractCollectionError } from '../collect';

const getUser = route.get('/users/:id')
    .input({ params: Type.Object({ id: Type.String() }) })
    .contract({
        since: '1.2.0',
        auth: 'clientProofV1',
        requiresSession: true,
        response: Type.Object({ id: Type.String(), email: Type.Optional(Type.String()) }),
    })
    .handler(async () => ({ id: '1' }));

const uncontracted = route.get('/health').handler(async () => ({ ok: true }));

describe('collecting a contract from a router', () =>
{
    it('takes only the routes that carry a contract', () =>
    {
        const document = collectContractDocument(defineRouter({ getUser, uncontracted }));

        expect(document.operations.map(operation => operation.name)).toEqual(['getUser']);
    });

    it('records the wire shape of a contracted route', () =>
    {
        const [operation] = collectContractDocument(defineRouter({ getUser })).operations;

        expect(operation).toMatchObject({
            name: 'getUser',
            method: 'GET',
            path: '/users/:id',
            since: '1.2.0',
            auth: 'clientProofV1',
            requiresSession: true,
        });
        expect(operation.request.params).toEqual({
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
        });
        expect(operation.response).toEqual({
            type: 'object',
            properties: { id: { type: 'string' }, email: { type: 'string' } },
            required: ['id'],
        });
    });

    it('defaults auth to none and requiresSession to false', () =>
    {
        const minimal = route.get('/ping')
            .contract({ since: '1.0.0', response: Type.Null() })
            .handler(async () => null);

        const [operation] = collectContractDocument(defineRouter({ minimal })).operations;

        expect(operation.auth).toBe('none');
        expect(operation.requiresSession).toBe(false);
    });

    it('records interceptor fields, which a direct client sends itself', () =>
    {
        const login = route.post('/_auth/login')
            .input({ body: Type.Object({ email: Type.String() }) })
            .interceptor({ body: Type.Object({ publicKey: Type.String() }) })
            .contract({ since: '1.0.0', response: Type.Object({ userId: Type.String() }) })
            .handler(async () => ({ userId: '1' }));

        const [operation] = collectContractDocument(defineRouter({ login })).operations;

        expect(operation.interceptor.body).toEqual({
            type: 'object',
            properties: { publicKey: { type: 'string' } },
            required: ['publicKey'],
        });
    });

    it('sorts operations by name so the file does not churn', () =>
    {
        const a = route.get('/a').contract({ since: '1.0.0', response: Type.Null() }).handler(async () => null);
        const z = route.get('/z').contract({ since: '1.0.0', response: Type.Null() }).handler(async () => null);

        const document = collectContractDocument(defineRouter({ zebra: z, apple: a }));

        expect(document.operations.map(operation => operation.name)).toEqual(['apple', 'zebra']);
    });

    it('reaches routes in nested and package routers', () =>
    {
        const nested = route.get('/admin/users')
            .contract({ since: '1.0.0', response: Type.Null() })
            .handler(async () => null);
        const packaged = route.get('/_auth/me')
            .contract({ since: '1.0.0', response: Type.Null() })
            .handler(async () => null);

        const router = defineRouter({ getUser, admin: defineRouter({ nested }) })
            .packages([defineRouter({ packaged })]);

        expect(collectContractDocument(router).operations.map(operation => operation.name))
            .toEqual(['getUser', 'nested', 'packaged']);
    });

    it('refuses two contracted routes with the same name', () =>
    {
        const duplicate = route.get('/other')
            .contract({ since: '1.0.0', response: Type.Null() })
            .handler(async () => null);

        const router = defineRouter({ getUser })
            .packages([defineRouter({ getUser: duplicate })]);

        expect(() => collectContractDocument(router)).toThrow(ContractCollectionError);
    });

    it('refuses a contract with no since version', () =>
    {
        const bad = route.get('/bad')
            .contract({ since: '', response: Type.Null() })
            .handler(async () => null);

        expect(() => collectContractDocument(defineRouter({ bad }))).toThrow(/since/);
    });
});
