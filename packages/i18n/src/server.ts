import {
    createTranslator,
    type LocaleCatalogs,
    type MessageKey,
    type Messages,
    type Namespace,
    type NamespacedMessages,
    type Translator,
} from './index';

export interface I18nConfiguration
{
    catalogs: LocaleCatalogs;
    fallbackLocale?: string;

    /** Reports a key that neither the locale nor the fallback locale answers. */
    onMissingKey?: (key: string) => void;
}

let catalogs: LocaleCatalogs = {};
let fallbackLocale = 'en';
let onMissingKey: ((key: string) => void) | undefined;

/**
 * Configures the process-wide catalog registry used by the server helpers.
 * Applications typically call this once during startup.
 */
export function configureI18n(configuration: I18nConfiguration): void
{
    catalogs = configuration.catalogs;
    fallbackLocale = configuration.fallbackLocale ?? 'en';
    onMissingKey = configuration.onMissingKey;
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
export function getT<N extends Namespace>(namespace: N, locale: string): Translator<MessageKey<N>>
{
    const { primary, fallback } = resolveNamespace(locale, namespace);

    return createTranslator<MessageKey<N>>(primary, fallback, { onMissingKey });
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
