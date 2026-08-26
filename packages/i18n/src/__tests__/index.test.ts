import { describe, expect, it, vi } from 'vitest';
import { createTranslator, interpolate, type TranslationVariables } from '../index';

describe('interpolate', () =>
{
    it('replaces string and number variables', () =>
    {
        expect(interpolate('Hello, {name}. You have {count} messages.', {
            name: 'Ada',
            count: 3,
        })).toBe('Hello, Ada. You have 3 messages.');
    });

    it('preserves placeholders without matching variables', () =>
    {
        expect(interpolate('{known} and {unknown}', { known: 'known' }))
            .toBe('known and {unknown}');
        expect(interpolate('{value}')).toBe('{value}');
    });

    it('does not read inherited properties', () =>
    {
        const variables = Object.create({ inherited: 'hidden' }) as TranslationVariables;

        expect(interpolate('{inherited}', variables)).toBe('{inherited}');
    });
});

describe('createTranslator', () =>
{
    it('prefers primary messages, falls back, and exposes unknown keys', () =>
    {
        const translate = createTranslator(
            { greeting: '안녕하세요, {name}' },
            { greeting: 'Hello, {name}', farewell: 'Goodbye' },
        );

        expect(translate('greeting', { name: 'Ada' })).toBe('안녕하세요, Ada');
        expect(translate('farewell')).toBe('Goodbye');
        expect(translate('missing')).toBe('missing');
    });

    it('keeps an empty message instead of falling through to the key', () =>
    {
        const translate = createTranslator({ blank: '' }, { blank: 'Fallback' });

        expect(translate('blank')).toBe('');
    });
});

describe('createTranslator onMissingKey', () =>
{
    it('stays quiet while a dictionary answers the key', () =>
    {
        const onMissingKey = vi.fn();
        const translate = createTranslator(
            { greeting: 'Hello' },
            { farewell: 'Goodbye' },
            { onMissingKey },
        );

        expect(translate('greeting')).toBe('Hello');
        expect(translate('farewell')).toBe('Goodbye');
        expect(onMissingKey).not.toHaveBeenCalled();
    });

    it('reports once per lookup no dictionary answers', () =>
    {
        const onMissingKey = vi.fn();
        const translate = createTranslator({}, undefined, { onMissingKey });

        expect(translate('checkout.submit')).toBe('checkout.submit');
        expect(onMissingKey).toHaveBeenCalledTimes(1);
        expect(onMissingKey).toHaveBeenCalledWith('checkout.submit');

        translate('checkout.submit');
        expect(onMissingKey).toHaveBeenCalledTimes(2);
    });

    it('returns the key unchanged without a hook', () =>
    {
        const translate = createTranslator({}, undefined, {});

        expect(translate('missing')).toBe('missing');
    });
});
