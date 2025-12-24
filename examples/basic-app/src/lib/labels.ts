/**
 * CMS Labels Configuration
 *
 * Define labels and create CMS client
 */

import { defineLabelConfig, defineLabels, createCmsClient } from '@spfn/cms';
import { getLocale } from '@spfn/cms/actions';

/**
 * Label configuration
 */
export const labelConfig = defineLabelConfig({
    locales: ['en', 'ko'] as const,
    defaultLocale: 'ko',
    fallbackLocale: 'en',
});

/**
 * Labels definition
 */
export const labelsDefinition = defineLabels({
    home: {
        hero: {
            title: { en: 'Welcome to SPFN', ko: 'SPFN에 오신 것을 환영합니다' },
            subtitle: { en: 'Build faster with type-safe APIs', ko: '타입 안전한 API로 더 빠르게 개발하세요' },
            cta: { en: 'Get Started', ko: '시작하기' },
        },
        features: {
            title: { en: 'Features', ko: '주요 기능' },
            item1: { en: 'Type-safe routing', ko: '타입 안전한 라우팅' },
            item2: { en: 'Auto-sync labels', ko: '자동 라벨 동기화' },
            item3: { en: 'Multi-language support', ko: '다국어 지원' },
        },
    },
    about: {
        title: { en: 'About Us', ko: '회사 소개' },
        description: { en: 'We build developer tools', ko: '우리는 개발자 도구를 만듭니다' },
    },
    common: {
        nav: {
            home: { en: 'Home', ko: '홈' },
            about: { en: 'About', ko: '소개' },
            contact: { en: 'Contact', ko: '연락처' },
        },
        footer: {
            copyright: { en: '© 2024 SPFN. All rights reserved.', ko: '© 2024 SPFN. 모든 권리 보유.' },
        },
    },
});

/**
 * CMS Client
 */
export const { api: cmsApi, getLabel, getLabels, format } = createCmsClient(
    labelsDefinition,
    {
        defaultLocale: labelConfig.defaultLocale,
        fallbackLocale: labelConfig.fallbackLocale,
        getLocale: () => getLocale(labelConfig.defaultLocale),
    }
);

/**
 * Type exports
 */
export type LabelConfig = typeof labelConfig;
export type AppLocale = typeof labelConfig.locales[number];
export type LabelsDefinition = typeof labelsDefinition;
