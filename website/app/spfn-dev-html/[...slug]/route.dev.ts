import { createDevHtmlHandler } from '@spfn/pages-next/dev';

// Dev-only route: the .dev.ts extension is routable only in `next dev`
// (next.config pageExtensions), so production builds never see it.
export const { GET } = createDevHtmlHandler({ root: '../site' });
