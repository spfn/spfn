import {
    createTranslator,
    type LocaleCatalogs,
    type Messages,
    type NamespacedMessages,
    type Translator,
} from './index';

export interface I18nConfiguration
{
    catalogs: LocaleCatalogs;
    fallbackLocale?: string;
}

let catalogs: LocaleCatalogs = {};
let fallbackLocale = 'en';

/**
 * Configures the process-wide catalog registry used by the server helpers.
 * Applications typically call this once during startup.
 */
export function configureI18n(configuration: I18nConfiguration): void
{
    catalogs = configuration.catalogs;
    fallbackLocale = configuration.fallbackLocale ?? 'en';
}

function resolveNamespace(locale: string, namespace: string): {
    primary: Messages;
    fallback?: Messages;
}
{
    const primary = catalogs[locale]?.[namespace] ?? {};
    const fallback = locale === fallbackLocale
        ? undefined
        : catalogs[fallbackLocale]?.[namespace];

    return { primary, fallback };
}

/** Creates a namespace-scoped translator for server components and handlers. */
export function getT(namespace: string, locale: string): Translator
{
    const { primary, fallback } = resolveNamespace(locale, namespace);

    return createTranslator(primary, fallback);
}

/**
 * Returns serializable messages for client hydration. Fallback messages are
 * merged first so locale-specific messages take precedence.
 */
export function getClientMessages(locale: string, namespaces: string[]): NamespacedMessages
{
    const messages: NamespacedMessages = {};

    for (const namespace of namespaces)
    {
        const { primary, fallback } = resolveNamespace(locale, namespace);
        messages[namespace] = { ...fallback, ...primary };
    }

    return messages;
}
