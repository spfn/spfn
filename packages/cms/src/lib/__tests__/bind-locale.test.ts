/**
 * bindLocale Tests
 *
 * Tests locale binding functionality for label definitions
 */

import { describe, it, expect } from 'vitest';
import { bindLocale } from '../bind-locale';
import { defineLabels } from '../define-labels';

describe('bindLocale', () =>
{
    describe('basic binding', () =>
    {
        it('should return locale-specific value', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.title).toBe("홈");
        });

        it('should work with English locale', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                },
            });

            const bound = bindLocale(labels, 'en');

            expect(bound.home.title).toBe("Home");
        });

        it('should handle multiple labels in same section', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                    subtitle: { en: "Welcome", ko: "환영합니다" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.title).toBe("홈");
            expect(bound.home.subtitle).toBe("환영합니다");
        });
    });

    describe('nested structure', () =>
    {
        it('should handle nested labels', () =>
        {
            const labels = defineLabels({
                home: {
                    hero: {
                        title: { en: "Welcome", ko: "환영합니다" },
                    },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.hero.title).toBe("환영합니다");
        });

        it('should handle deeply nested labels', () =>
        {
            const labels = defineLabels({
                home: {
                    section: {
                        hero: {
                            title: { en: "Deep", ko: "깊음" },
                        },
                    },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.section.hero.title).toBe("깊음");
        });

        it('should handle mixed nesting levels', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                    hero: {
                        title: { en: "Hero", ko: "히어로" },
                        subtitle: { en: "Subtitle", ko: "부제목" },
                    },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.title).toBe("홈");
            expect(bound.home.hero.title).toBe("히어로");
            expect(bound.home.hero.subtitle).toBe("부제목");
        });
    });

    describe('multiple sections', () =>
    {
        it('should handle multiple sections', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                },
                about: {
                    title: { en: "About", ko: "소개" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.title).toBe("홈");
            expect(bound.about.title).toBe("소개");
        });

        it('should handle complex multi-section structure', () =>
        {
            const labels = defineLabels({
                home: {
                    hero: {
                        title: { en: "Welcome", ko: "환영합니다" },
                    },
                },
                about: {
                    team: {
                        title: { en: "Team", ko: "팀" },
                    },
                },
                contact: {
                    title: { en: "Contact", ko: "연락처" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.hero.title).toBe("환영합니다");
            expect(bound.about.team.title).toBe("팀");
            expect(bound.contact.title).toBe("연락처");
        });
    });

    describe('fallback locale', () =>
    {
        it('should use fallback when locale not found', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                },
            });

            const bound = bindLocale(labels, 'ja', 'en');

            expect(bound.home.title).toBe("Home");
        });

        it('should prefer specified locale over fallback', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈", ja: "ホーム" },
                },
            });

            const bound = bindLocale(labels, 'ja', 'en');

            expect(bound.home.title).toBe("ホーム");
        });

        it('should use fallback for nested labels', () =>
        {
            const labels = defineLabels({
                home: {
                    hero: {
                        title: { en: "Welcome", ko: "환영합니다" },
                    },
                },
            });

            const bound = bindLocale(labels, 'ja', 'ko');

            expect(bound.home.hero.title).toBe("환영합니다");
        });
    });

    describe('missing locale handling', () =>
    {
        it('should return first available locale when locale not found', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                },
            });

            const bound = bindLocale(labels, 'ja');

            // Should return first locale (en)
            expect(bound.home.title).toBe("Home");
        });

        it('should handle missing locale consistently', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { ko: "홈", en: "Home" },
                },
            });

            const bound = bindLocale(labels, 'ja');

            // Should return first locale in definition order
            expect(typeof bound.home.title).toBe('string');
            expect(['홈', 'Home']).toContain(bound.home.title);
        });
    });

    describe('variable templates', () =>
    {
        it('should bind locale for template strings', () =>
        {
            const labels = defineLabels({
                home: {
                    greeting: { en: "Hello, {name}!", ko: "안녕하세요, {name}님!" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.greeting).toBe("안녕하세요, {name}님!");
        });

        it('should work with t() function for variable substitution', () =>
        {
            const labels = defineLabels({
                home: {
                    greeting: { en: "Hello, {name}!", ko: "안녕하세요, {name}님!" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            // Manual t() implementation for test
            const t = (template: string, vars: Record<string, any>) =>
            {
                return template.replace(/\{(\w+)}/g, (match, key) =>
                {
                    return vars[key] !== undefined ? String(vars[key]) : match;
                });
            };

            expect(t(bound.home.greeting, { name: "John" })).toBe("안녕하세요, John님!");
        });
    });

    describe('real-world scenarios', () =>
    {
        it('should handle typical landing page structure', () =>
        {
            const labels = defineLabels({
                home: {
                    slogan: { en: "Build faster", ko: "더 빠르게 구축" },
                    hero: {
                        title: { en: "Welcome to SPFN", ko: "SPFN에 오신 것을 환영합니다" },
                        subtitle: { en: "Type-safe backend", ko: "타입 안전 백엔드" },
                        cta: { en: "Get Started", ko: "시작하기" },
                    },
                    features: {
                        title: { en: "Features", ko: "기능" },
                        subtitle: { en: "Everything you need", ko: "필요한 모든 것" },
                    },
                },
            });

            const boundKo = bindLocale(labels, 'ko');
            const boundEn = bindLocale(labels, 'en');

            expect(boundKo.home.slogan).toBe("더 빠르게 구축");
            expect(boundKo.home.hero.title).toBe("SPFN에 오신 것을 환영합니다");
            expect(boundKo.home.features.subtitle).toBe("필요한 모든 것");

            expect(boundEn.home.slogan).toBe("Build faster");
            expect(boundEn.home.hero.title).toBe("Welcome to SPFN");
            expect(boundEn.home.features.subtitle).toBe("Everything you need");
        });

        it('should handle e-commerce structure', () =>
        {
            const labels = defineLabels({
                products: {
                    list: {
                        title: { en: "Products", ko: "상품" },
                        filter: {
                            category: { en: "Category", ko: "카테고리" },
                            price: { en: "Price", ko: "가격" },
                        },
                    },
                    detail: {
                        addToCart: { en: "Add to Cart", ko: "장바구니에 담기" },
                        buyNow: { en: "Buy Now", ko: "바로 구매" },
                    },
                },
                cart: {
                    title: { en: "Shopping Cart", ko: "장바구니" },
                    empty: { en: "Cart is empty", ko: "장바구니가 비어있습니다" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.products.list.filter.category).toBe("카테고리");
            expect(bound.products.detail.addToCart).toBe("장바구니에 담기");
            expect(bound.cart.empty).toBe("장바구니가 비어있습니다");
        });

        it('should handle bilingual Arabic-English setup', () =>
        {
            const labels = defineLabels({
                home: {
                    slogan: { en: "Welcome", ar: "أهلا بك" },
                    hero: {
                        title: { en: "Innovative Solutions", ar: "حلول مبتكرة" },
                    },
                },
            });

            const boundAr = bindLocale(labels, 'ar');
            const boundEn = bindLocale(labels, 'en');

            expect(boundAr.home.slogan).toBe("أهلا بك");
            expect(boundAr.home.hero.title).toBe("حلول مبتكرة");

            expect(boundEn.home.slogan).toBe("Welcome");
            expect(boundEn.home.hero.title).toBe("Innovative Solutions");
        });
    });

    describe('edge cases', () =>
    {
        it('should handle empty string values', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "", ko: "" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.title).toBe("");
        });

        it('should handle special characters', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Hello, World! 👋", ko: "안녕하세요! 👋" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.title).toBe("안녕하세요! 👋");
        });

        it('should handle HTML entities', () =>
        {
            const labels = defineLabels({
                home: {
                    copyright: { en: "© 2024 Company &amp; Co.", ko: "© 2024 회사 &amp; Co." },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.copyright).toBe("© 2024 회사 &amp; Co.");
        });

        it('should handle multiline strings', () =>
        {
            const labels = defineLabels({
                home: {
                    description: {
                        en: "Line 1\nLine 2\nLine 3",
                        ko: "줄 1\n줄 2\n줄 3",
                    },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.description).toContain("줄 2");
        });

        it('should handle locale codes with hyphens', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { "en-US": "Home", "en-GB": "Home", "zh-CN": "首页" },
                },
            });

            const bound = bindLocale(labels, 'zh-CN');

            expect(bound.home.title).toBe("首页");
        });
    });

    describe('switching locales', () =>
    {
        it('should create independent bound instances', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                },
            });

            const boundKo = bindLocale(labels, 'ko');
            const boundEn = bindLocale(labels, 'en');

            expect(boundKo.home.title).toBe("홈");
            expect(boundEn.home.title).toBe("Home");
        });

        it('should not interfere with original definition', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: "Home", ko: "홈" },
                },
            });

            const bound = bindLocale(labels, 'ko');

            expect(bound.home.title).toBe("홈");
            expect(labels.home.title).toEqual({ en: "Home", ko: "홈" });
        });
    });
});