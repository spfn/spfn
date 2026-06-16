/**
 * defineLabels Tests
 *
 * Tests tRPC-style nested label structure definition
 */

import { describe, it, expect } from 'vitest';
import { defineLabels } from '../define-labels';

describe('defineLabels', () =>
{
    describe('basic structure', () =>
    {
        it('should return labels as-is', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: 'Welcome', ko: '환영합니다' },
                },
            });

            expect(labels).toEqual({
                home: {
                    title: { en: 'Welcome', ko: '환영합니다' },
                },
            });
        });

        it('should handle single section with single label', () =>
        {
            const labels = defineLabels({
                home: {
                    slogan: { en: 'Build faster', ko: '더 빠르게 구축' },
                },
            });

            expect(labels.home.slogan).toEqual({
                en: 'Build faster',
                ko: '더 빠르게 구축',
            });
        });

        it('should handle multiple sections', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: 'Home', ko: '홈' },
                },
                about: {
                    title: { en: 'About', ko: '소개' },
                },
            });

            expect(labels.home.title).toEqual({ en: 'Home', ko: '홈' });
            expect(labels.about.title).toEqual({ en: 'About', ko: '소개' });
        });
    });

    describe('nested structure', () =>
    {
        it('should handle nested labels', () =>
        {
            const labels = defineLabels({
                home: {
                    hero: {
                        title: { en: 'Hello', ko: '안녕하세요' },
                        subtitle: { en: 'Welcome', ko: '환영합니다' },
                    },
                },
            });

            expect(labels.home.hero.title).toEqual({
                en: 'Hello',
                ko: '안녕하세요',
            });
            expect(labels.home.hero.subtitle).toEqual({
                en: 'Welcome',
                ko: '환영합니다',
            });
        });

        it('should handle deeply nested labels', () =>
        {
            const labels = defineLabels({
                home: {
                    hero: {
                        header: {
                            title: { en: 'Deep Title', ko: '깊은 제목' },
                        },
                    },
                },
            });

            expect(labels.home.hero.header.title).toEqual({
                en: 'Deep Title',
                ko: '깊은 제목',
            });
        });

        it('should handle mixed nesting levels', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: 'Home', ko: '홈' },
                    hero: {
                        title: { en: 'Hero Title', ko: '히어로 제목' },
                        subtitle: { en: 'Subtitle', ko: '부제목' },
                    },
                    footer: {
                        copyright: { en: '© 2024', ko: '© 2024' },
                    },
                },
            });

            expect(labels.home.title).toEqual({ en: 'Home', ko: '홈' });
            expect(labels.home.hero.title).toEqual({ en: 'Hero Title', ko: '히어로 제목' });
            expect(labels.home.footer.copyright).toEqual({ en: '© 2024', ko: '© 2024' });
        });
    });

    describe('multiple locales', () =>
    {
        it('should handle two locales', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: 'Home', ko: '홈' },
                },
            });

            expect(labels.home.title.en).toBe('Home');
            expect(labels.home.title.ko).toBe('홈');
        });

        it('should handle three locales', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: 'Home', ko: '홈', ja: 'ホーム' },
                },
            });

            expect(labels.home.title.en).toBe('Home');
            expect(labels.home.title.ko).toBe('홈');
            expect(labels.home.title.ja).toBe('ホーム');
        });

        it('should handle many locales', () =>
        {
            const labels = defineLabels({
                home: {
                    title: {
                        en: 'Home',
                        ko: '홈',
                        ja: 'ホーム',
                        zh: '首页',
                        es: 'Inicio',
                        fr: 'Accueil',
                    },
                },
            });

            expect(labels.home.title.en).toBe('Home');
            expect(labels.home.title.ko).toBe('홈');
            expect(labels.home.title.ja).toBe('ホーム');
            expect(labels.home.title.zh).toBe('首页');
            expect(labels.home.title.es).toBe('Inicio');
            expect(labels.home.title.fr).toBe('Accueil');
        });
    });

    describe('type safety', () =>
    {
        it('should preserve const assertion types', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: 'Home', ko: '홈' },
                },
            } as const);

            // Type test: This should work at compile time
            const title = labels.home.title.en;
            expect(title).toBe('Home');
        });

        it('should allow type extraction', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: 'Home', ko: '홈' },
                },
            });

            type Labels = typeof labels;

            const testLabels: Labels = {
                home: {
                    title: { en: 'Home', ko: '홈' },
                },
            };

            expect(testLabels).toEqual(labels);
        });
    });

    describe('real-world scenarios', () =>
    {
        it('should handle typical landing page structure', () =>
        {
            const labels = defineLabels({
                home: {
                    slogan: { en: 'Build faster', ko: '더 빠르게 구축' },
                    hero: {
                        title: { en: 'Welcome to SPFN', ko: 'SPFN에 오신 것을 환영합니다' },
                        subtitle: { en: 'Type-safe backend', ko: '타입 안전 백엔드' },
                        cta: { en: 'Get Started', ko: '시작하기' },
                    },
                    features: {
                        title: { en: 'Features', ko: '기능' },
                        subtitle: { en: 'Everything you need', ko: '필요한 모든 것' },
                    },
                },
                about: {
                    title: { en: 'About Us', ko: '회사 소개' },
                    description: { en: 'We build tools', ko: '우리는 도구를 만듭니다' },
                },
            });

            expect(labels.home.slogan.en).toBe('Build faster');
            expect(labels.home.hero.title.ko).toBe('SPFN에 오신 것을 환영합니다');
            expect(labels.home.features.title.en).toBe('Features');
            expect(labels.about.title.ko).toBe('회사 소개');
        });

        it('should handle e-commerce structure', () =>
        {
            const labels = defineLabels({
                products: {
                    list: {
                        title: { en: 'Products', ko: '상품' },
                        filter: {
                            category: { en: 'Category', ko: '카테고리' },
                            price: { en: 'Price', ko: '가격' },
                        },
                    },
                    detail: {
                        addToCart: { en: 'Add to Cart', ko: '장바구니에 담기' },
                        buyNow: { en: 'Buy Now', ko: '바로 구매' },
                    },
                },
                cart: {
                    title: { en: 'Shopping Cart', ko: '장바구니' },
                    empty: { en: 'Cart is empty', ko: '장바구니가 비어있습니다' },
                    checkout: { en: 'Checkout', ko: '결제하기' },
                },
            });

            expect(labels.products.list.filter.category.en).toBe('Category');
            expect(labels.products.detail.addToCart.ko).toBe('장바구니에 담기');
            expect(labels.cart.empty.en).toBe('Cart is empty');
        });

        it('should handle bilingual Arabic-English setup', () =>
        {
            const labels = defineLabels({
                home: {
                    slogan: { en: 'Welcome', ar: 'أهلا بك' },
                    hero: {
                        title: { en: 'Innovative Solutions', ar: 'حلول مبتكرة' },
                    },
                },
            });

            expect(labels.home.slogan.en).toBe('Welcome');
            expect(labels.home.slogan.ar).toBe('أهلا بك');
            expect(labels.home.hero.title.ar).toBe('حلول مبتكرة');
        });
    });

    describe('edge cases', () =>
    {
        it('should handle empty sections', () =>
        {
            const labels = defineLabels({
                home: {},
            });

            expect(labels.home).toEqual({});
        });

        it('should handle empty string values', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: '', ko: '' },
                },
            });

            expect(labels.home.title.en).toBe('');
            expect(labels.home.title.ko).toBe('');
        });

        it('should handle special characters in values', () =>
        {
            const labels = defineLabels({
                home: {
                    title: { en: 'Hello, World! 👋', ko: '안녕하세요! 👋' },
                },
            });

            expect(labels.home.title.en).toBe('Hello, World! 👋');
            expect(labels.home.title.ko).toBe('안녕하세요! 👋');
        });

        it('should handle HTML entities in values', () =>
        {
            const labels = defineLabels({
                home: {
                    copyright: { en: '© 2024 Company &amp; Co.', ko: '© 2024 회사 &amp; Co.' },
                },
            });

            expect(labels.home.copyright.en).toBe('© 2024 Company &amp; Co.');
        });

        it('should handle multiline strings', () =>
        {
            const labels = defineLabels({
                home: {
                    description: {
                        en: 'Line 1\nLine 2\nLine 3',
                        ko: '줄 1\n줄 2\n줄 3',
                    },
                },
            });

            expect(labels.home.description.en).toContain('Line 2');
            expect(labels.home.description.ko).toContain('줄 2');
        });
    });
});
