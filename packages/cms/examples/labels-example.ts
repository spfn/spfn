/**
 * Label Definition Example
 *
 * defineLabelSection을 사용한 라벨 정의 예제
 *
 * 사용법:
 * 이 패턴을 사용하여 `src/labels/` 디렉토리에 라벨 파일 생성
 *
 * 주의: 백엔드/서버 컴포넌트에서만 import
 * import { defineLabelSection } from '@spfn/cms';
 */

import { defineLabelSection } from '@spfn/cms';

// 예제 1: 단일 언어 라벨
export const simpleLabels = defineLabelSection('simple', {
    welcome: {
        key: 'simple.welcome',
        defaultValue: 'Welcome to our website!',
    },
    description: {
        key: 'simple.description',
        defaultValue: 'This is a simple label example.',
    },
});

// 예제 2: 다국어 라벨
export const layoutLabels = defineLabelSection('layout', {
    nav: {
        home: {
            key: 'layout.nav.home',
            defaultValue: {
                ko: '홈',
                en: 'Home',
            },
        },
        about: {
            key: 'layout.nav.about',
            defaultValue: {
                ko: '소개',
                en: 'About',
            },
        },
        contact: {
            key: 'layout.nav.contact',
            defaultValue: {
                ko: '문의',
                en: 'Contact',
            },
        },
    },
    footer: {
        copyright: {
            key: 'layout.footer.copyright',
            defaultValue: {
                ko: '© 2025 회사명. 모든 권리 보유.',
                en: '© 2025 Company. All rights reserved.',
            },
            description: 'Footer copyright text',
        },
        privacy: {
            key: 'layout.footer.privacy',
            defaultValue: {
                ko: '개인정보처리방침',
                en: 'Privacy Policy',
            },
        },
        terms: {
            key: 'layout.footer.terms',
            defaultValue: {
                ko: '이용약관',
                en: 'Terms of Service',
            },
        },
    },
});

// 예제 3: 중첩된 구조
export const homeLabels = defineLabelSection('home', {
    hero: {
        title: {
            key: 'home.hero.title',
            defaultValue: {
                ko: '혁신적인 솔루션으로\n비즈니스를 성장시키세요',
                en: 'Grow Your Business\nWith Innovative Solutions',
            },
            description: 'Main hero title on home page',
        },
        subtitle: {
            key: 'home.hero.subtitle',
            defaultValue: {
                ko: '최고의 기술과 서비스로 고객의 성공을 지원합니다',
                en: 'We support your success with best technology and service',
            },
        },
        cta: {
            key: 'home.hero.cta',
            defaultValue: {
                ko: '시작하기',
                en: 'Get Started',
            },
        },
    },
    features: {
        section_title: {
            key: 'home.features.section_title',
            defaultValue: {
                ko: '주요 기능',
                en: 'Key Features',
            },
        },
        feature_1: {
            title: {
                key: 'home.features.feature_1.title',
                defaultValue: {
                    ko: '빠른 속도',
                    en: 'Fast Performance',
                },
            },
            description: {
                key: 'home.features.feature_1.description',
                defaultValue: {
                    ko: '최적화된 성능으로 빠른 서비스를 제공합니다',
                    en: 'Delivers fast service with optimized performance',
                },
            },
        },
        feature_2: {
            title: {
                key: 'home.features.feature_2.title',
                defaultValue: {
                    ko: '안정성',
                    en: 'Reliability',
                },
            },
            description: {
                key: 'home.features.feature_2.description',
                defaultValue: {
                    ko: '24/7 안정적인 서비스를 보장합니다',
                    en: 'Guarantees 24/7 stable service',
                },
            },
        },
    },
});

// 예제 4: 설명이 포함된 라벨
export const productLabels = defineLabelSection('product', {
    pricing: {
        title: {
            key: 'product.pricing.title',
            defaultValue: {
                ko: '요금제',
                en: 'Pricing',
            },
            description: 'Pricing section title',
        },
        free: {
            name: {
                key: 'product.pricing.free.name',
                defaultValue: {
                    ko: '무료',
                    en: 'Free',
                },
                description: 'Free plan name',
            },
            price: {
                key: 'product.pricing.free.price',
                defaultValue: {
                    ko: '₩0',
                    en: '$0',
                },
            },
            features: {
                key: 'product.pricing.free.features',
                defaultValue: {
                    ko: '기본 기능\n월 100회 사용\n이메일 지원',
                    en: 'Basic features\n100 uses/month\nEmail support',
                },
                description: 'List of features for free plan (newline separated)',
            },
        },
    },
});