import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider, useLocale, useT } from '../client';

function TranslationConsumer()
{
    const locale = useLocale();
    const translate = useT('common');

    return <span>{locale}:{translate('greeting', { name: 'Ada' })}:{translate('missing')}</span>;
}

describe('I18nProvider', () =>
{
    it('provides the locale and namespaced translator', () =>
    {
        const markup = renderToStaticMarkup(
            <I18nProvider
                locale="ko"
                messages={{ common: { greeting: '안녕하세요, {name}' } }}
            >
                <TranslationConsumer />
            </I18nProvider>,
        );

        expect(markup).toBe('<span>ko:안녕하세요, Ada:missing</span>');
    });

    it('has development-friendly defaults outside a provider', () =>
    {
        expect(renderToStaticMarkup(<TranslationConsumer />))
            .toBe('<span>en:greeting:missing</span>');
    });
});
