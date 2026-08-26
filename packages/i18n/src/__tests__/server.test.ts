import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('reports only the keys neither locale answers', () =>
    {
        const onMissingKey = vi.fn();

        configureI18n({
            fallbackLocale: 'en',
            onMissingKey,
            catalogs: {
                en: { common: { greeting: 'Hello', farewell: 'Goodbye' } },
                ko: { common: { greeting: '안녕하세요' } },
            },
        });

        const translate = getT('common', 'ko');

        translate('greeting');
        translate('farewell');
        expect(onMissingKey).not.toHaveBeenCalled();

        expect(translate('missing')).toBe('missing');
        expect(onMissingKey).toHaveBeenCalledTimes(1);
        expect(onMissingKey).toHaveBeenCalledWith('missing');
    });

    it('drops the reporter when a later configuration omits it', () =>
    {
        const onMissingKey = vi.fn();

        configureI18n({ catalogs: {}, onMissingKey });
        configureI18n({ catalogs: {} });

        expect(getT('common', 'ko')('missing')).toBe('missing');
        expect(onMissingKey).not.toHaveBeenCalled();
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
