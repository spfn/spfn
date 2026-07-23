/** A flat message dictionary for one namespace. */
export type Messages = Record<string, string>;

/** A collection of message dictionaries keyed by namespace. */
export type NamespacedMessages = Record<string, Messages>;

/** A collection of namespaced messages keyed by locale. */
export type LocaleCatalogs = Record<string, NamespacedMessages>;

export type TranslationVariables = Record<string, string | number>;
export type Translator = (key: string, variables?: TranslationVariables) => string;

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
 * translations remain visible during development.
 */
export function createTranslator(messages: Messages, fallback?: Messages): Translator
{
    return (key, variables) =>
    {
        const template = messages[key] ?? fallback?.[key] ?? key;

        return interpolate(template, variables);
    };
}
