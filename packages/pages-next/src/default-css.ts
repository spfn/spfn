/**
 * Baseline stylesheet — enough for a repo with no theme/ to look publishable.
 * Every value defers to an `--sf-*` token so `theme/tokens.json` overrides it
 * without fighting specificity; `custom.css` layers after this.
 */
export const DEFAULT_CSS = `
*, *::before, *::after { box-sizing: border-box; }

body
{
    margin: 0;
    font-family: var(--sf-font-body, ui-sans-serif, system-ui, -apple-system, sans-serif);
    background: var(--sf-color-bg, #ffffff);
    color: var(--sf-color-fg, #1a1a1a);
    line-height: 1.65;
}

.sf-site { min-height: 100vh; display: flex; flex-direction: column; }

.sf-header
{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    max-width: var(--sf-width-content, 48rem);
    width: 100%;
    margin: 0 auto;
    padding: 1rem 1.25rem;
}

.sf-brand { font-weight: 700; text-decoration: none; color: inherit; }
.sf-nav { display: flex; gap: 1rem; flex-wrap: wrap; }
.sf-nav a { text-decoration: none; color: var(--sf-color-muted, #555); }
.sf-nav a:hover { color: var(--sf-color-fg, #1a1a1a); }

.sf-main
{
    flex: 1;
    max-width: var(--sf-width-content, 48rem);
    width: 100%;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 4rem;
}

.sf-footer
{
    max-width: var(--sf-width-content, 48rem);
    width: 100%;
    margin: 0 auto;
    padding: 1.5rem 1.25rem;
    display: flex;
    gap: 1rem;
    color: var(--sf-color-muted, #555);
}
.sf-footer a { color: inherit; }

.sf-title { font-size: 2rem; line-height: 1.2; margin: 0 0 0.5rem; }
.sf-date { color: var(--sf-color-muted, #555); font-size: 0.875rem; }

.sf-content h1, .sf-content h2, .sf-content h3 { line-height: 1.25; }
.sf-content a { color: var(--sf-color-accent, #2563eb); }
.sf-content img { max-width: 100%; height: auto; }
.sf-content pre { padding: 1rem; border-radius: 8px; overflow-x: auto; }
.sf-content :not(pre) > code
{
    background: var(--sf-color-code-bg, rgba(127, 127, 127, 0.12));
    padding: 0.15em 0.35em;
    border-radius: 4px;
    font-size: 0.9em;
}
.sf-content blockquote
{
    margin: 0;
    padding-left: 1rem;
    border-left: 3px solid var(--sf-color-accent, #2563eb);
    color: var(--sf-color-muted, #555);
}
.sf-content table { border-collapse: collapse; width: 100%; }
.sf-content th, .sf-content td
{
    border: 1px solid var(--sf-color-border, #e2e2e2);
    padding: 0.4rem 0.7rem;
    text-align: left;
}

.sf-main:has(> .sf-doc-shell) { max-width: calc(var(--sf-width-content, 48rem) + 16rem); }
.sf-doc-shell { display: flex; gap: 2.5rem; align-items: flex-start; }
.sf-doc-shell .sf-doc { min-width: 0; flex: 1; }

.sf-sidebar
{
    width: 13.5rem;
    flex-shrink: 0;
    position: sticky;
    top: 1rem;
    font-size: 0.875rem;
    line-height: 1.5;
}
.sf-sidebar ul { list-style: none; margin: 0; padding: 0; }
.sf-sidebar ul ul { padding-left: 0.85rem; }
.sf-sidebar li { margin: 0.35rem 0; }
.sf-sidebar a { text-decoration: none; color: var(--sf-color-muted, #555); }
.sf-sidebar a:hover { color: var(--sf-color-fg, #1a1a1a); }
.sf-sidebar a[aria-current="page"] { color: var(--sf-color-accent, #2563eb); font-weight: 600; }
.sf-sidebar-group { color: var(--sf-color-fg, #1a1a1a); font-weight: 600; }

@media (max-width: 56rem)
{
    .sf-doc-shell { display: block; }
    .sf-sidebar { position: static; width: auto; margin-bottom: 2rem; }
}

.sf-post-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1rem; }
.sf-post-list a { text-decoration: none; color: inherit; font-weight: 600; }
.sf-post-list a:hover { color: var(--sf-color-accent, #2563eb); }

@media (prefers-color-scheme: dark)
{
    body
    {
        background: var(--sf-color-bg-dark, #101014);
        color: var(--sf-color-fg-dark, #e8e8e8);
    }
    .sf-nav a, .sf-footer, .sf-date, .sf-content blockquote, .sf-sidebar a { color: var(--sf-color-muted-dark, #9a9aa2); }
    .sf-nav a:hover, .sf-sidebar a:hover { color: var(--sf-color-fg-dark, #e8e8e8); }
    .sf-sidebar a[aria-current="page"] { color: var(--sf-color-accent, #2563eb); }
    .sf-sidebar-group { color: var(--sf-color-fg-dark, #e8e8e8); }
    .sf-content th, .sf-content td { border-color: var(--sf-color-border-dark, #2c2c33); }
}
`;
