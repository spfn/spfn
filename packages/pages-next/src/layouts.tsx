import type { ReactNode } from 'react';
import { socialLabel } from '@spfn/pages';
import type { NavNode, PageDoc, SiteContent } from '@spfn/pages';
import { DEFAULT_CSS } from './default-css';

export interface SiteLayoutProps
{
    site: SiteContent;
    page: PageDoc;
}

/**
 * Common chrome: header (brand + nav), main, footer (brand + nav + social), and
 * the site's CSS (baseline + theme). Styles ride inside the shell so the template
 * repo's `layout.tsx` stays a bare html/body — React hoists them into <head>.
 */
/** External nav/social targets leave the site — open them in a new tab. */
function externalProps(url: string)
{
    return /^https?:\/\//.test(url) ? { target: '_blank', rel: 'noopener' } : {};
}

export function SiteShell({ site, children }: { site: SiteContent; children: ReactNode })
{
    // Social entries whose URL already sits in the nav would render twice in the footer.
    const navUrls = new Set(site.config.nav.map(item => item.path));
    const social = Object.entries(site.config.social).filter(([, url]) => !navUrls.has(url));

    return (
        <div className="sf-site">
            <style dangerouslySetInnerHTML={{ __html: `${DEFAULT_CSS}\n${site.themeCss}` }} />
            <header className="sf-header">
                <a className="sf-brand" href="/">{site.config.name}</a>
                <nav className="sf-nav">
                    {site.config.nav.map(item => <a key={item.path} href={item.path} {...externalProps(item.path)}>{item.label}</a>)}
                </nav>
            </header>
            <main className="sf-main">{children}</main>
            <footer className="sf-footer">
                <span className="sf-footer-brand">{site.config.name}</span>
                <nav className="sf-footer-nav">
                    {site.config.nav.map(item => <a key={item.path} href={item.path} {...externalProps(item.path)}>{item.label}</a>)}
                    {social.map(([name, url]) => <a key={name} href={url} {...externalProps(url)}>{socialLabel(name)}</a>)}
                </nav>
                {site.config.footerNote && <span className="sf-footer-note">{site.config.footerNote}</span>}
            </footer>
        </div>
    );
}

/** Landing pages own their full presentation — the body markdown is the hero. */
export function LandingLayout({ site, page }: SiteLayoutProps)
{
    return (
        <SiteShell site={site}>
            <article className="sf-content sf-landing" dangerouslySetInnerHTML={{ __html: page.html }} />
        </SiteShell>
    );
}

/** Docs render the frontmatter title as the page heading — bodies start at `##`. */
export function DocLayout({ site, page }: SiteLayoutProps)
{
    const section = sidebarSection(site, page);
    const article = (
        <article className="sf-doc">
            <h1 className="sf-title">{page.frontmatter.title}</h1>
            <div className="sf-content" dangerouslySetInnerHTML={{ __html: page.html }} />
        </article>
    );

    return (
        <SiteShell site={site}>
            {section
                ? <div className="sf-doc-shell"><SectionSidebar section={section} current={page.slug} />{article}</div>
                : article}
        </SiteShell>
    );
}

/** The page's section tree — shown only when it navigates somewhere (two or more docs). */
function sidebarSection(site: SiteContent, page: PageDoc): NavNode | null
{
    const top = `/${page.slug.slice(1).split('/')[0]}`;
    const section = site.sections.find(candidate => candidate.route === top);

    return section && countDocs(section) >= 2 ? section : null;
}

function countDocs(node: NavNode): number
{
    return (node.hasDoc ? 1 : 0) + node.children.reduce((sum, child) => sum + countDocs(child), 0);
}

/** The section root renders as the first flat item — its children are the list, not a nesting level. */
function SectionSidebar({ section, current }: { section: NavNode; current: string })
{
    return (
        <nav className="sf-sidebar" aria-label="Section navigation">
            <ul>
                <li>
                    {section.hasDoc
                        ? <a href={section.route} aria-current={section.route === current ? 'page' : undefined}>{section.title}</a>
                        : <span className="sf-sidebar-group">{section.title}</span>}
                </li>
                {section.children.map(child => <SidebarItem key={child.route} node={child} current={current} />)}
            </ul>
        </nav>
    );
}

function SidebarItem({ node, current }: { node: NavNode; current: string })
{
    return (
        <li>
            {node.hasDoc
                ? <a href={node.route} aria-current={node.route === current ? 'page' : undefined}>{node.title}</a>
                : <span className="sf-sidebar-group">{node.title}</span>}
            {node.children.length > 0 && (
                <ul>{node.children.map(child => <SidebarItem key={child.route} node={child} current={current} />)}</ul>
            )}
        </li>
    );
}

export function PostLayout({ site, page }: SiteLayoutProps)
{
    return (
        <SiteShell site={site}>
            <article className="sf-post">
                <h1 className="sf-title">{page.frontmatter.title}</h1>
                {page.frontmatter.date && <p className="sf-date"><time dateTime={page.frontmatter.date}>{page.frontmatter.date}</time></p>}
                <div className="sf-content" dangerouslySetInnerHTML={{ __html: page.html }} />
            </article>
        </SiteShell>
    );
}

/** Virtual '/posts' index — served when no page claims that slug. */
export function PostsIndexLayout({ site }: { site: SiteContent })
{
    return (
        <SiteShell site={site}>
            <h1 className="sf-title">Posts</h1>
            <ul className="sf-post-list">
                {site.posts.map(post => (
                    <li key={post.slug}>
                        <a href={post.slug}>{post.frontmatter.title}</a>
                        {post.frontmatter.date && <span className="sf-date"> — {post.frontmatter.date}</span>}
                    </li>
                ))}
            </ul>
        </SiteShell>
    );
}
