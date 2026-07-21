/**
 * @spfn/pages shared types — the site spec as code.
 *
 * A publishable repo opts in with a root-level `spfn.site.yaml` (proof of intent to
 * publish + site meta + content root). Content lives under the configured root
 * (default `site/`): `pages/`, `posts/`, `theme/`, `public/`.
 */

/** Root-level opt-in + config file. Its presence is the owner's consent to publish. */
export const SITE_CONFIG_FILE = 'spfn.site.yaml';

export const PAGE_LAYOUTS = ['landing', 'doc', 'post'] as const;
export type PageLayout = typeof PAGE_LAYOUTS[number];

export interface NavItem
{
    label: string;
    path: string;
}

export interface SiteConfig
{
    name: string;
    description?: string;
    /** Content root inside the repo, normalized without leading/trailing slashes. '' = repo root. */
    root: string;
    locale?: string;
    nav: NavItem[];
    social: Record<string, string>;
}

export interface PageFrontmatter
{
    title: string;
    description?: string;
    layout: PageLayout;
    /** ISO date (YYYY-MM-DD). Required convention for posts. */
    date?: string;
    draft: boolean;
    /** Path to an OG image inside `public/`. */
    og?: string;
}

export interface PageDoc
{
    /** URL path the document is served at, e.g. '/', '/docs/intro', '/posts/hello'. */
    slug: string;
    /** Repo-relative source path, e.g. 'site/pages/index.md'. */
    sourcePath: string;
    frontmatter: PageFrontmatter;
    /** Sanitized HTML rendered from the markdown body. */
    html: string;
}

/** A per-file validation failure — the file is skipped, the site still loads. */
export interface SiteProblem
{
    path: string;
    message: string;
}

export interface SiteContent
{
    config: SiteConfig;
    pages: PageDoc[];
    /** Sorted by date, newest first. */
    posts: PageDoc[];
    /** Theme tokens as CSS variables + custom.css, ready to inline. */
    themeCss: string;
    problems: SiteProblem[];
}
