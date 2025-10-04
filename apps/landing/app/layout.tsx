import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'SPFN - The Missing Backend for Next.js',
    description: 'TypeScript 풀스택 프레임워크. Rails의 생산성 + Spring Boot의 견고함',
};

export default function RootLayout({ children }: { children: React.ReactNode })
{
    return (
        <html lang="ko">
            <body>{children}</body>
        </html>
    );
}