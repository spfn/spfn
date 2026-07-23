import { describe, expect, it } from 'vitest';
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
});
