import { parse } from 'yaml';
import { Value } from '@sinclair/typebox/value';
import { SiteConfigSchema } from '../shared/schemas';
import { SiteConfigError } from '../shared/errors';
import { SITE_CONFIG_FILE, type SiteConfig } from '../shared/types';

export function parseSiteConfig(yamlText: string): SiteConfig
{
    const raw: unknown = parse(yamlText);
    if (!Value.Check(SiteConfigSchema, raw))
    {
        const first = Value.Errors(SiteConfigSchema, raw).First();
        throw new SiteConfigError(`${SITE_CONFIG_FILE} invalid at '${first?.path ?? ''}': ${first?.message ?? 'unknown error'}`);
    }

    return {
        name: raw.name,
        description: raw.description,
        root: normalizeRoot(raw.root ?? 'site'),
        url: raw.url?.replace(/\/+$/, ''),
        locale: raw.locale,
        nav: raw.nav ?? [],
        social: raw.social ?? {},
    };
}

function normalizeRoot(root: string): string
{
    const trimmed = root.replace(/^\.?\//, '').replace(/\/+$/, '');

    return trimmed === '.' ? '' : trimmed;
}
