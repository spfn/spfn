/**
 * TypeScript Compile-time Type Error Tests
 *
 * This file uses type assertions to verify that invalid usage produces compile errors.
 * Run with: tsc --noEmit to verify type errors are caught.
 */

import { defineLabels, createCmsClient, defineLabelConfig } from '../index';
import { expectTypeOf } from 'vitest';

const labelsDefinition = defineLabels({
    home: {
        title: { en: 'Home', ko: '홈' },
        hero: {
            title: { en: 'Welcome', ko: '환영합니다' }
        }
    },
    about: {
        title: { en: 'About Us', ko: '회사 소개' }
    },
    contact: {
        email: { en: 'Email', ko: '이메일' }
    }
});

const labelConfig = defineLabelConfig({
    locales: ['en', 'ko'] as const,
    defaultLocale: 'en'
});

const { getLabel, getLabels } = createCmsClient(labelsDefinition, labelConfig);

/**
 * Test 1: Invalid section name should be caught at compile time
 */
// @ts-expect-error
async function testInvalidSectionName()
{
    // @ts-expect-error - 'invalid' is not a valid section name
    const label = await getLabel('invalid');

    // @ts-expect-error - 'test' is not a valid section name
    const label2 = await getLabel('test');

    // @ts-expect-error - Array with invalid section name
    const labels = await getLabels(['home', 'invalid']);
}

/**
 * Test 2: getLabel returns direct access (no section name)
 */
// @ts-expect-error
async function testGetLabelDirectAccess()
{
    const label = await getLabel('home');

    // ✅ Valid: direct access without section name
    expectTypeOf(label.title).toBeString();
    expectTypeOf(label.hero).toBeObject();
    expectTypeOf(label.hero.title).toBeString();

    // Type system should NOT have 'home' property (direct access)
    expectTypeOf(label).not.toHaveProperty('home');
}

/**
 * Test 3: getLabels returns sections with names
 */
// @ts-expect-error
async function testGetLabelsWithSectionNames()
{
    const labels = await getLabels(['home', 'about']);

    // ✅ Valid: accessing requested sections
    expectTypeOf(labels.home).toBeObject();
    expectTypeOf(labels.about).toBeObject();
    expectTypeOf(labels.home.title).toBeString();

    // Type system should not have 'contact' property
    expectTypeOf(labels).not.toHaveProperty('contact');
}

/**
 * Test 4: Nested property access type checking
 */
// @ts-expect-error
async function testNestedPropertyTypes()
{
    const label = await getLabel('home');

    // ✅ Valid: nested properties exist
    expectTypeOf(label.hero).toBeObject();
    expectTypeOf(label.hero.title).toBeString();

    // @ts-expect-error - 'nonexistent' property doesn't exist
    const invalid = label.nonexistent;

    // @ts-expect-error - 'subtitle' doesn't exist in hero
    const invalid2 = label.hero.subtitle;
}

/**
 * Test 5: Section keys should be string literals
 */
// @ts-expect-error
async function testSectionKeyLiterals()
{
    // ✅ Valid: string literal for getLabel
    const label = await getLabel('home');

    // ✅ Valid: readonly array of string literals for getLabels
    const labels = await getLabels(['home', 'about'] as const);

    // Type should be inferred correctly
    expectTypeOf(label).toHaveProperty('title');
    expectTypeOf(labels).toHaveProperty('home');
    expectTypeOf(labels).toHaveProperty('about');
}

/**
 * Test 6: Return type should match requested sections
 */
// @ts-expect-error
async function testReturnType()
{
    // Single section - direct access
    const single = await getLabel('home');
    expectTypeOf(single).toHaveProperty('title');
    expectTypeOf(single).toHaveProperty('hero');
    expectTypeOf(single).not.toHaveProperty('home'); // No section wrapper

    // Multiple sections - with section names
    const multiple = await getLabels(['home', 'contact']);
    expectTypeOf(multiple).toHaveProperty('home');
    expectTypeOf(multiple).toHaveProperty('contact');
    expectTypeOf(multiple).not.toHaveProperty('about');
}

/**
 * Test 7: getLabel vs getLabels distinction
 */
// @ts-expect-error
async function testApiDistinction()
{
    // getLabel: single section, direct access
    const label = await getLabel('home');
    expectTypeOf(label.title).toBeString();

    // getLabels: multiple sections, section names as keys
    const labels = await getLabels(['home', 'about']);
    expectTypeOf(labels.home.title).toBeString();
    expectTypeOf(labels.about.title).toBeString();
}