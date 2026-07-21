import type { ReactNode } from 'react';
import { socialLabel } from '@spfn/pages';
import type { PageDoc, SiteContent } from '@spfn/pages';
import { DEFAULT_CSS } from './default-css';

export interface SiteLayoutProps
{
    site: SiteContent;
    page: PageDoc;
}

/**
 * Common chrome: header (brand + nav), main, footer (social), and the site's CSS
 * (baseline + theme). Styles ride inside the shell so the template repo's
 * `layout.tsx` stays a bare html/body — React hoists them into <head>.
 */
export function SiteShell({ site, children }: { site: SiteContent; children: ReactNode })
{
    return (
        <div className="sf-site">
            <style dangerouslySetInnerHTML={{ __html: `${DEFAULT_CSS}\n${site.themeCss}` }} />
            <header className="sf-header">
                <a className="sf-brand" href="/">{site.config.name}</a>
                <nav className="sf-nav">
                    {site.config.nav.map(item => <a key={item.path} href={item.path}>{item.label}</a>)}
                </nav>
            </header>
            <main className="sf-main">{children}</main>
            <footer className="sf-footer">
                {Object.entries(site.config.social).map(([name, url]) => <a key={name} href={url}>{socialLabel(name)}</a>)}
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
    return (
        <SiteShell site={site}>
            <article className="sf-doc">
                <h1 className="sf-title">{page.frontmatter.title}</h1>
                <div className="sf-content" dangerouslySetInnerHTML={{ __html: page.html }} />
            </article>
        </SiteShell>
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
