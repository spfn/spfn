/** A flat message dictionary for one namespace. */
export type Messages = Record<string, string>;

/** A collection of message dictionaries keyed by namespace. */
export type NamespacedMessages = Record<string, Messages>;

/** A collection of namespaced messages keyed by locale. */
export type LocaleCatalogs = Record<string, NamespacedMessages>;

export type TranslationVariables = Record<string, string | number>;

/**
 * The registration point for an application's own catalog shape. Augment it
 * once, against this exact module id, and every translator is typed:
 *
 * ```ts
 * declare module '@spfn/i18n'
 * {
 *     interface I18nTypeRegistry { messages: typeof en }
 * }
 * ```
 *
 * Left unaugmented it stays empty, and every type derived from it degrades to
 * plain `string` — an application that registers nothing keeps today's
 * behaviour, with no key checking and no compile errors.
 */
export interface I18nTypeRegistry
{
}

/** The catalog shape an application registered, or `never` when none is. */
type RegisteredMessages = I18nTypeRegistry extends { messages: infer M }
    ? M
    : never;

/** Namespace names of a catalog shape — plain `string` when there is none. */
export type NamespaceOf<M> = [M] extends [never]
    ? string
    : Extract<keyof M, string>;

/** Message keys of one namespace in a catalog shape — plain `string` when there is none. */
export type MessageKeyOf<M, N extends PropertyKey> = [M] extends [never]
    ? string
    : Extract<N extends keyof M ? keyof M[N] : string, string>;

/** Namespace names this application registered, or `string` when it registered none. */
export type Namespace = NamespaceOf<RegisteredMessages>;

/** Message keys of one registered namespace, or `string` when nothing is registered. */
export type MessageKey<N extends Namespace> = MessageKeyOf<RegisteredMessages, N>;

export type Translator<K extends string = string> =
    (key: K, variables?: TranslationVariables) => string;

export interface TranslatorOptions
{
    /**
     * Called when neither the primary nor the fallback dictionary holds the
     * key. The lookup still returns the key itself, so reporting is the only
     * effect.
     */
    onMissingKey?: (key: string) => void;
}

/** @deprecated Use {@link TranslationVariables}. */
export type TVars = TranslationVariables;

/** @deprecated Use {@link Translator}. */
export type TFn = Translator;

/**
 * Replaces `{variable}` placeholders with string or number values.
 * Placeholders without a matching own property are preserved.
 */
export function interpolate(template: string, variables?: TranslationVariables): string
{
    if (!variables)
    {
        return template;
    }

    return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    {
        if (!Object.prototype.hasOwnProperty.call(variables, key))
        {
            return placeholder;
        }

        return String(variables[key]);
    });
}

/**
 * Creates a translator from a primary message dictionary and an optional
 * fallback dictionary. Unknown keys are returned unchanged so that missing
 * translations remain visible during development, and `onMissingKey` observes
 * each such lookup.
 */
export function createTranslator<K extends string = string>(
    messages: Messages,
    fallback?: Messages,
    options?: TranslatorOptions,
): Translator<K>
{
    return (key, variables) =>
    {
        const template = messages[key] ?? fallback?.[key];

        if (template === undefined)
        {
            options?.onMissingKey?.(key);

            return interpolate(key, variables);
        }

        return interpolate(template, variables);
    };
}
