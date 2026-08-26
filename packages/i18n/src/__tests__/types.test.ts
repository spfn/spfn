import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { getT } from '../server';
import type {
    MessageKey,
    MessageKeyOf,
    Namespace,
    NamespaceOf,
    Translator,
} from '../index';

/**
 * Stands in for a catalog an application registers through
 * `declare module '@spfn/i18n'`. Augmenting the package's own module id from
 * inside its own sources is not possible, so the derived helpers are exercised
 * against this shape directly — the augmented path composes them the same way.
 */
interface DemoCatalog
{
    checkout: {
        'checkout.readTerms': string;
        'checkout.submit': string;
    };
    common: {
        'common.save': string;
    };
}

type DemoNamespace = NamespaceOf<DemoCatalog>;

type DemoKey<N extends DemoNamespace> = MessageKeyOf<DemoCatalog, N>;

type DemoGetT = <N extends DemoNamespace>(namespace: N) => Translator<DemoKey<N>>;

/**
 * Compile-time assertions: never called, `tsc --noEmit` is what runs them.
 * Every `@ts-expect-error` fails the build if the line stops being an error.
 */
export function registeredKeysAreChecked(getDemoT: DemoGetT): void
{
    const t = getDemoT('checkout');

    t('checkout.readTerms');
    t('checkout.submit', { name: 'Ada' });

    // @ts-expect-error a mistyped key is not a key of this namespace
    t('checkout.readTems');

    // @ts-expect-error another namespace's key is not a key of this one
    t('common.save');

    // @ts-expect-error an unregistered namespace is not selectable
    getDemoT('billing');

    // The escape hatch documented for dynamic keys.
    const sku: string = 'submit';
    t(`checkout.${sku}` as DemoKey<'checkout'>);
}

describe('derived key types', () =>
{
    it('degrades to plain string while no catalog is registered', () =>
    {
        expectTypeOf<Namespace>().toEqualTypeOf<string>();
        expectTypeOf<Namespace>().not.toBeNever();
        expectTypeOf<MessageKey<'anything'>>().toEqualTypeOf<string>();
        expectTypeOf<MessageKey<'anything'>>().not.toBeNever();
        expectTypeOf<MessageKey<string>>().toEqualTypeOf<string>();

        const translate = getT('anything', 'en');

        expectTypeOf(translate).parameter(0).toEqualTypeOf<string>();
        expect(translate('any.key')).toBe('any.key');
    });

    it('names the namespaces and keys of a registered catalog', () =>
    {
        expectTypeOf<DemoNamespace>().toEqualTypeOf<'checkout' | 'common'>();
        expectTypeOf<DemoKey<'checkout'>>()
            .toEqualTypeOf<'checkout.readTerms' | 'checkout.submit'>();
        expectTypeOf<DemoKey<'common'>>().toEqualTypeOf<'common.save'>();
        expectTypeOf<DemoKey<DemoNamespace>>()
            .toEqualTypeOf<'checkout.readTerms' | 'checkout.submit' | 'common.save'>();
    });
});

const distDirectory = new URL('../../dist/', import.meta.url);

function readDist(name: string): string | undefined
{
    const path = fileURLToPath(new URL(name, distDirectory));

    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

describe('published type surface', () =>
{
    // These assertions describe dist, so they stand down before a build.
    it('routes the client and server entries through the root module', () =>
    {
        const index = readDist('index.d.ts');
        const client = readDist('client.d.ts');
        const server = readDist('server.d.ts');

        if (!index || !client || !server)
        {
            return;
        }

        // An inlined copy of the registry would be a separate declaration, and
        // an application's `declare module '@spfn/i18n'` would never reach it.
        expect(index).toContain('type I18nTypeRegistry');
        expect(client).toContain(`from './index.js'`);
        expect(client).not.toContain('interface I18nTypeRegistry');
        expect(server).toContain(`from './index.js'`);
        expect(server).not.toContain('interface I18nTypeRegistry');
    });
});
