import {
    createContext,
    useContext,
    useMemo,
    type ReactNode,
} from 'react';
import {
    createTranslator,
    type NamespacedMessages,
    type Translator,
} from './index';

export interface I18nProviderProps
{
    locale: string;
    messages: NamespacedMessages;
    children: ReactNode;
}

interface I18nContextValue
{
    locale: string;
    messages: NamespacedMessages;
}

const defaultContext: I18nContextValue = {
    locale: 'en',
    messages: {},
};

const I18nContext = createContext<I18nContextValue>(defaultContext);

/** Makes a resolved locale and its namespaced messages available to hooks. */
export function I18nProvider({ locale, messages, children }: I18nProviderProps)
{
    const value = useMemo(() => ({ locale, messages }), [locale, messages]);

    return (
        <I18nContext.Provider value={value}>
            {children}
        </I18nContext.Provider>
    );
}

/** Returns a memoized translator for one namespace. */
export function useT(namespace: string): Translator
{
    const { messages } = useContext(I18nContext);

    return useMemo(
        () => createTranslator(messages[namespace] ?? {}),
        [messages, namespace],
    );
}

/** Returns the locale supplied by the closest provider. */
export function useLocale(): string
{
    return useContext(I18nContext).locale;
}
