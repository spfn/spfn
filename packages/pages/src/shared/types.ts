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
    /** Canonical site origin (e.g. 'https://example.com') — makes og:image URLs absolute. */
    url?: string;
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

/**
 * A raw HTML page under `pages/` — the escape hatch. Served verbatim as a full,
 * standalone document: no layout wrapping, no sanitization, the author owns the
 * content (scripts included). Theme tokens are opt-in via a linked stylesheet.
 */
export interface HtmlPage
{
    /** URL path the document is served at — same slug rules as markdown pages. */
    slug: string;
    /** Repo-relative source path, e.g. 'site/pages/playground.html'. */
    sourcePath: string;
    /** Extracted from the document's `<title>`, falling back to the file name. */
    title: string;
    /** The full document, exactly as committed. */
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
    /** Raw HTML pages served verbatim, outside the layout/sanitize path. */
    htmlPages: HtmlPage[];
    /** Theme tokens as CSS variables + custom.css, ready to inline. */
    themeCss: string;
    /** Served URL of `public/favicon.{svg,png,ico,jpg,jpeg}` when present, e.g. '/favicon.svg'. */
    favicon?: string;
    /** Served URL of `public/og.{png,jpg,jpeg,webp}` when present — the site-wide OG image default. */
    ogImage?: string;
    problems: SiteProblem[];
}
