import { beforeEach, describe, expect, it } from 'vitest';
import { configureI18n, getClientMessages, getT } from '../server';

beforeEach(() =>
{
    configureI18n({
        fallbackLocale: 'en',
        catalogs: {
            en: {
                common: {
                    greeting: 'Hello, {name}',
                    farewell: 'Goodbye',
                },
                account: {
                    title: 'Account',
                },
            },
            ko: {
                common: {
                    greeting: '안녕하세요, {name}',
                },
            },
        },
    });
});

describe('getT', () =>
{
    it('translates from the requested locale with fallback support', () =>
    {
        const translate = getT('common', 'ko');

        expect(translate('greeting', { name: 'Ada' })).toBe('안녕하세요, Ada');
        expect(translate('farewell')).toBe('Goodbye');
        expect(translate('missing')).toBe('missing');
    });

    it('uses the default fallback locale after reconfiguration', () =>
    {
        configureI18n({
            fallbackLocale: 'fr',
            catalogs: { fr: { common: { greeting: 'Bonjour' } } },
        });
        configureI18n({
            catalogs: { en: { common: { greeting: 'Hello' } } },
        });

        expect(getT('common', 'ko')('greeting')).toBe('Hello');
    });
});

describe('getClientMessages', () =>
{
    it('merges locale messages over fallback messages by namespace', () =>
    {
        expect(getClientMessages('ko', ['common', 'account'])).toEqual({
            common: {
                greeting: '안녕하세요, {name}',
                farewell: 'Goodbye',
            },
            account: {
                title: 'Account',
            },
        });
    });

    it('returns an empty dictionary for an unknown namespace', () =>
    {
        expect(getClientMessages('ko', ['unknown'])).toEqual({ unknown: {} });
    });
});
