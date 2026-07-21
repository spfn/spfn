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

/**
 * A repo file or directory served as site routes. File mounts serve one
 * markdown file at `route`; directory mounts serve every `.md` under `source`
 * at `route/<relative-path>` (README/index files collapse onto their dir).
 */
export interface MountConfig
{
    /** Repo-relative path — a `.md` file or a directory. */
    source: string;
    /** Served route the mount maps onto, e.g. '/packages/core'. */
    route: string;
    /** Title override for the doc served exactly at `route`. */
    title?: string;
}

export interface SiteConfig
{
    name: string;
    description?: string;
    /** Content root inside the repo, normalized without leading/trailing slashes. '' = repo root. */
    root: string;
    /** Canonical site origin (e.g. 'https://example.com') — makes og:image URLs absolute. */
    url?: string;
    /** Canonical repo URL (e.g. 'https://github.com/spfn/spfn') — non-doc relative links resolve here. */
    repo?: string;
    locale?: string;
    nav: NavItem[];
    social: Record<string, string>;
    /** Repo docs served as site routes — see MountConfig. */
    mounts: MountConfig[];
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
    /** Sidebar position among siblings — ascending, unordered pages after, then title. */
    order?: number;
    /**
     * Repo-relative `.md` file whose content this page serves at its own route —
     * the curated alternative to a directory mount. The page body (optional)
     * renders first as a preface; the referenced doc follows, its links resolved
     * from its own repo location. The page's frontmatter governs title/layout/draft;
     * the referenced doc's frontmatter is not consulted beyond heading stripping.
     */
    source?: string;
}

/**
 * One node of a section navigation tree, derived from served doc slugs: the
 * first path segment is the section, deeper segments nest beneath it.
 */
export interface NavNode
{
    /** Route of this node's position, e.g. '/packages/core' — always present. */
    route: string;
    /** The doc's frontmatter title, or the path segment for label-only group nodes. */
    title: string;
    /** True when a document is served at `route`; group nodes are labels only. */
    hasDoc: boolean;
    /** Ordered by frontmatter `order` (ascending, unordered last), then title. */
    children: NavNode[];
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
    /** Docs mounted from the repo (config `mounts`), routable like pages. */
    mounted: PageDoc[];
    /**
     * Top-level section navigation trees derived from doc slugs (pages +
     * mounted; the root landing, posts, and HTML pages are excluded). Renderers
     * show a section's tree as the sidebar on doc pages.
     */
    sections: NavNode[];
    /** Theme tokens as CSS variables + custom.css, ready to inline. */
    themeCss: string;
    /** Served URL of `public/favicon.{svg,png,ico,jpg,jpeg}` when present, e.g. '/favicon.svg'. */
    favicon?: string;
    /** Served URL of `public/og.{png,jpg,jpeg,webp}` when present — the site-wide OG image default. */
    ogImage?: string;
    problems: SiteProblem[];
}
