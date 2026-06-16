import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'SPFN · 01 Minimal API',
    description: 'The smallest SPFN app: one route, one typed client call.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>)
{
    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                    background: '#0a0a0a',
                    color: '#ededed',
                }}
            >
                {children}
            </body>
        </html>
    );
}
