/**
 * Locale Distribution Logic Test
 *
 * 단일 값이 모든 locale에 복사되는지 검증하는 단위 테스트
 */

import { describe, it, expect } from 'vitest';

/**
 * updatePublishedCache 함수의 로케일 분산 로직을 시뮬레이션
 */
function simulateLocaleDistribution(labels: Array<{ key: string; defaultValue: string }>)
{
    const localesSet = new Set<string>();
    const labelsByLocale: Record<string, Record<string, any>> = {};
    const singleValueLabels: Array<{ key: string; value: any }> = [];

    // First pass: 다국어 객체 처리 및 사용 중인 locale 수집
    labels.forEach((label) =>
    {
        try
        {
            const parsed = JSON.parse(label.defaultValue || '{}');

            if (typeof parsed === 'object' && !Array.isArray(parsed))
            {
                // Multilingual object
                Object.keys(parsed).forEach((locale) => localesSet.add(locale));
                Object.entries(parsed).forEach(([locale, value]) =>
                {
                    if (!labelsByLocale[locale]) labelsByLocale[locale] = {};
                    labelsByLocale[locale][label.key] = value;
                });
            }
            else
            {
                // Single value (will be distributed to all locales in second pass)
                singleValueLabels.push({ key: label.key, value: label.defaultValue });
            }
        }
        catch
        {
            // Plain string (will be distributed to all locales in second pass)
            singleValueLabels.push({ key: label.key, value: label.defaultValue });
        }
    });

    // 최소 기본 locale 보장 (ko, en)
    if (localesSet.size === 0)
    {
        localesSet.add('ko');
        localesSet.add('en');
    }

    // Second pass: 단일 값을 모든 locale에 복사
    singleValueLabels.forEach(({ key, value }) =>
    {
        localesSet.forEach((locale) =>
        {
            if (!labelsByLocale[locale]) labelsByLocale[locale] = {};
            labelsByLocale[locale][key] = value;
        });
    });

    return { localesSet, labelsByLocale };
}

describe('Locale Distribution Logic', () =>
{
    it('should distribute single values to all locales when multilingual values exist', () =>
    {
        const labels = [
            {
                key: 'home.companies.1.title',
                defaultValue: JSON.stringify({
                    ko: '처음엔 모든 게 무모해 보였죠',
                    en: 'At first, everything seemed reckless',
                }),
            },
            {
                key: 'home.companies.1.logo',
                defaultValue: '/companies/soslab-logo.png',
            },
            {
                key: 'home.companies.1.media',
                defaultValue: '/companies/soslab-media.jpg',
            },
        ];

        const { localesSet, labelsByLocale } = simulateLocaleDistribution(labels);

        // 사용된 locale 확인
        expect(localesSet.size).toBe(2);
        expect(localesSet.has('ko')).toBe(true);
        expect(localesSet.has('en')).toBe(true);

        // 다국어 객체는 locale별로 분산
        expect(labelsByLocale.ko['home.companies.1.title']).toBe('처음엔 모든 게 무모해 보였죠');
        expect(labelsByLocale.en['home.companies.1.title']).toBe('At first, everything seemed reckless');

        // 단일 값(이미지 경로)은 모든 locale에 복사
        expect(labelsByLocale.ko['home.companies.1.logo']).toBe('/companies/soslab-logo.png');
        expect(labelsByLocale.en['home.companies.1.logo']).toBe('/companies/soslab-logo.png');
        expect(labelsByLocale.ko['home.companies.1.media']).toBe('/companies/soslab-media.jpg');
        expect(labelsByLocale.en['home.companies.1.media']).toBe('/companies/soslab-media.jpg');
    });

    it('should distribute single values to minimum locales (ko, en) when no multilingual values exist', () =>
    {
        const labels = [
            {
                key: 'home.logo',
                defaultValue: '/logo.png',
            },
            {
                key: 'home.image',
                defaultValue: '/image.jpg',
            },
        ];

        const { localesSet, labelsByLocale } = simulateLocaleDistribution(labels);

        // 기본 locale (ko, en) 확인
        expect(localesSet.size).toBe(2);
        expect(localesSet.has('ko')).toBe(true);
        expect(localesSet.has('en')).toBe(true);

        // 단일 값이 모든 locale에 복사
        expect(labelsByLocale.ko['home.logo']).toBe('/logo.png');
        expect(labelsByLocale.en['home.logo']).toBe('/logo.png');
        expect(labelsByLocale.ko['home.image']).toBe('/image.jpg');
        expect(labelsByLocale.en['home.image']).toBe('/image.jpg');
    });

    it('should handle mixed single and multilingual values correctly', () =>
    {
        const labels = [
            {
                key: 'home.title',
                defaultValue: JSON.stringify({
                    ko: '제목',
                    en: 'Title',
                    ja: 'タイトル',
                }),
            },
            {
                key: 'home.subtitle',
                defaultValue: 'Subtitle (shared)',
            },
            {
                key: 'home.logo',
                defaultValue: '/logo.png',
            },
        ];

        const { localesSet, labelsByLocale } = simulateLocaleDistribution(labels);

        // 사용된 locale 확인 (ja 포함)
        expect(localesSet.size).toBe(3);
        expect(localesSet.has('ko')).toBe(true);
        expect(localesSet.has('en')).toBe(true);
        expect(localesSet.has('ja')).toBe(true);

        // 다국어 객체는 locale별로 분산
        expect(labelsByLocale.ko['home.title']).toBe('제목');
        expect(labelsByLocale.en['home.title']).toBe('Title');
        expect(labelsByLocale.ja['home.title']).toBe('タイトル');

        // 단일 값은 모든 locale에 복사
        expect(labelsByLocale.ko['home.subtitle']).toBe('Subtitle (shared)');
        expect(labelsByLocale.en['home.subtitle']).toBe('Subtitle (shared)');
        expect(labelsByLocale.ja['home.subtitle']).toBe('Subtitle (shared)');

        expect(labelsByLocale.ko['home.logo']).toBe('/logo.png');
        expect(labelsByLocale.en['home.logo']).toBe('/logo.png');
        expect(labelsByLocale.ja['home.logo']).toBe('/logo.png');
    });

    it('should handle only multilingual values (no single values)', () =>
    {
        const labels = [
            {
                key: 'home.title',
                defaultValue: JSON.stringify({
                    ko: '환영합니다',
                    en: 'Welcome',
                }),
            },
            {
                key: 'home.description',
                defaultValue: JSON.stringify({
                    ko: '설명',
                    en: 'Description',
                }),
            },
        ];

        const { localesSet, labelsByLocale } = simulateLocaleDistribution(labels);

        // 사용된 locale 확인
        expect(localesSet.size).toBe(2);
        expect(localesSet.has('ko')).toBe(true);
        expect(localesSet.has('en')).toBe(true);

        // 다국어 객체만 존재
        expect(labelsByLocale.ko).toEqual({
            'home.title': '환영합니다',
            'home.description': '설명',
        });
        expect(labelsByLocale.en).toEqual({
            'home.title': 'Welcome',
            'home.description': 'Description',
        });
    });

    it('should handle real futureplay companies data structure', () =>
    {
        const labels = [
            {
                key: 'home.companies.1.title',
                defaultValue: JSON.stringify({
                    ko: '처음엔 모든 게 무모해 보였죠\n하지만 그 시작이 세상을 바꿉니다',
                    en: 'At first, everything seemed reckless\nBut that beginning changes the world',
                }),
            },
            {
                key: 'home.companies.1.name',
                defaultValue: '(주)에스오에스랩',
            },
            {
                key: 'home.companies.1.logo',
                defaultValue: '/companies/soslab-logo.png',
            },
            {
                key: 'home.companies.1.media',
                defaultValue: '/companies/soslab-media.jpg',
            },
            {
                key: 'home.companies.1.history1',
                defaultValue: '2014 창업',
            },
            {
                key: 'home.companies.1.history2',
                defaultValue: '2020 퓨플 시드 투자',
            },
            {
                key: 'home.companies.1.history3',
                defaultValue: '2024 국내 최초 자율주행 센서 기업 코스닥 상장',
            },
        ];

        const { localesSet, labelsByLocale } = simulateLocaleDistribution(labels);

        // 사용된 locale 확인
        expect(localesSet.size).toBe(2);
        expect(localesSet.has('ko')).toBe(true);
        expect(localesSet.has('en')).toBe(true);

        // 다국어 title은 locale별로 분산
        expect(labelsByLocale.ko['home.companies.1.title']).toBe(
            '처음엔 모든 게 무모해 보였죠\n하지만 그 시작이 세상을 바꿉니다'
        );
        expect(labelsByLocale.en['home.companies.1.title']).toBe(
            'At first, everything seemed reckless\nBut that beginning changes the world'
        );

        // 단일 값들은 모든 locale에 복사
        const singleValueKeys = [
            'home.companies.1.name',
            'home.companies.1.logo',
            'home.companies.1.media',
            'home.companies.1.history1',
            'home.companies.1.history2',
            'home.companies.1.history3',
        ];

        singleValueKeys.forEach((key) =>
        {
            expect(labelsByLocale.ko[key]).toBeDefined();
            expect(labelsByLocale.en[key]).toBeDefined();
            expect(labelsByLocale.ko[key]).toBe(labelsByLocale.en[key]);
        });

        // 특정 값 확인
        expect(labelsByLocale.ko['home.companies.1.logo']).toBe('/companies/soslab-logo.png');
        expect(labelsByLocale.en['home.companies.1.logo']).toBe('/companies/soslab-logo.png');
        expect(labelsByLocale.ko['home.companies.1.media']).toBe('/companies/soslab-media.jpg');
        expect(labelsByLocale.en['home.companies.1.media']).toBe('/companies/soslab-media.jpg');
    });
});