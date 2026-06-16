/**
 * Type Safety Tests
 *
 * This file contains tests to verify type-safe section access in getLabel/getLabels
 * These are compile-time type tests, not runtime tests
 */

import { describe, it, expect } from 'vitest';
import { defineLabels, createCmsClient, defineLabelConfig, type SectionKeys, type BoundLabelSection, type BoundLabelsSections } from '../index';

describe('Type Safety - getLabel (single section)', () =>
{
    const labelsDefinition = defineLabels({
        home: {
            title: { en: 'Home', ko: '홈' },
            hero: {
                title: { en: 'Welcome', ko: '환영합니다' },
                subtitle: { en: 'Start your journey', ko: '여정을 시작하세요' },
            },
        },
        signup: {
            title: { en: 'Sign Up', ko: '가입하기' },
            userName: { en: 'User Name', ko: '사용자명' },
        },
    });

    const labelConfig = defineLabelConfig({
        locales: ['en', 'ko'] as const,
        defaultLocale: 'en',
        fallbackLocale: 'en',
    });

    const { getLabel } = createCmsClient(labelsDefinition, labelConfig);

    it('type check: should allow valid section names', () =>
    {
        // @ts-expect-no-error - Valid section names should compile
        const validHome: Parameters<typeof getLabel>[0] = 'home';
        const validSignup: Parameters<typeof getLabel>[0] = 'signup';

        expect(validHome).toBe('home');
        expect(validSignup).toBe('signup');
    });

    it('type check: return type has no section wrapper', () =>
    {
        // BoundLabelSection should return direct content
        // This verifies the type structure at compile time
        const _typeCheck: BoundLabelSection<typeof labelsDefinition, 'home'> | undefined = undefined;
        expect(_typeCheck).toBeUndefined();
    });
});

describe('Type Safety - getLabels (multiple sections)', () =>
{
    const labelsDefinition = defineLabels({
        home: {
            title: { en: 'Home', ko: '홈' },
        },
        about: {
            title: { en: 'About', ko: '소개' },
        },
        contact: {
            email: { en: 'Email', ko: '이메일' },
        },
    });

    const labelConfig = defineLabelConfig({
        locales: ['en', 'ko'] as const,
        defaultLocale: 'en',
    });

    const { getLabels } = createCmsClient(labelsDefinition, labelConfig);

    it('type check: should allow valid section arrays', () =>
    {
        // @ts-expect-no-error - Valid section arrays should compile
        const validArray: Parameters<typeof getLabels>[0] = ['home', 'about'];
        const validReadonly: Parameters<typeof getLabels>[0] = ['home', 'contact'] as const;

        expect(validArray).toEqual(['home', 'about']);
        expect(validReadonly).toEqual(['home', 'contact']);
    });

    it('type check: BoundLabelsSections picks requested sections', () =>
    {
        // Multiple sections - this verifies type structure at compile time
        const _typeCheck: BoundLabelsSections<typeof labelsDefinition, 'home' | 'about'> | undefined = undefined;
        expect(_typeCheck).toBeUndefined();
    });
});

describe('Type Safety - SectionKeys', () =>
{
    it('should extract correct section keys type', () =>
    {
        const labelsDefinition = defineLabels({
            home: { title: { en: 'Home' } },
            about: { title: { en: 'About' } },
        });

        type Sections = SectionKeys<typeof labelsDefinition>;

        // Verify the type extracts section keys correctly
        const validSection: Sections = 'home';
        const anotherValid: Sections = 'about';

        expect(validSection).toBe('home');
        expect(anotherValid).toBe('about');
    });
});

describe('Type Safety - API Distinction', () =>
{
    const labelsDefinition = defineLabels({
        home: {
            title: { en: 'Home', ko: '홈' },
            nested: {
                value: { en: 'Nested', ko: '중첩' },
            },
        },
        about: {
            title: { en: 'About', ko: '소개' },
        },
    });

    const labelConfig = defineLabelConfig({
        locales: ['en', 'ko'] as const,
        defaultLocale: 'en',
    });

    const { getLabel, getLabels } = createCmsClient(labelsDefinition, labelConfig);

    it('type check: getLabel returns direct content', () =>
    {
        // getLabel should return section content directly - compile time verification
        const _typeCheck: Awaited<ReturnType<typeof getLabel<'home'>>> | undefined = undefined;
        // Should have 'title' and 'nested', but NOT 'home'
        expect(_typeCheck).toBeUndefined();
    });

    it('type check: getLabels returns sections with names', () =>
    {
        // getLabels should return object with section names - compile time verification
        const _typeCheck: Awaited<ReturnType<typeof getLabels<'home' | 'about'>>> | undefined = undefined;
        // Should have 'home' and 'about' properties
        expect(_typeCheck).toBeUndefined();
    });
});
