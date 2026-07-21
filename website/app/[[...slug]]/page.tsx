import { createSitePages } from '@spfn/pages-next';
import { FsContentSource } from '@spfn/pages/server';

const site = createSitePages({ source: () => new FsContentSource('..') });

export const generateStaticParams = site.generateStaticParams;
export const generateMetadata = site.generateMetadata;
export default site.Page;
