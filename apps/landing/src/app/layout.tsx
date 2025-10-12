import { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";

import "../assets/styles/globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
    variable: "--font-jetbrains-mono",
    subsets: ["latin"],
});

const sansation = localFont({
    src: [
        {
            path: "../assets/fonts/sansation/Sansation-Light.woff",
            weight: "300",
            style: "normal",
        },
        {
            path: "../assets/fonts/sansation/Sansation-LightItalic.woff",
            weight: "300",
            style: "italic",
        },
        {
            path: "../assets/fonts/sansation/Sansation-Regular.woff",
            weight: "400",
            style: "normal",
        },
        {
            path: "../assets/fonts/sansation/Sansation-Italic.woff",
            weight: "400",
            style: "italic",
        },
        {
            path: "../assets/fonts/sansation/Sansation-Bold.woff",
            weight: "700",
            style: "normal",
        },
        {
            path: "../assets/fonts/sansation/Sansation-BoldItalic.woff",
            weight: "700",
            style: "italic",
        },
    ],
    variable: "--font-sansation",
});

export const metadata: Metadata = {
    metadataBase: new URL('https://superfunction.xyz'),
    title: "SPFN - Type-safe backend for Next.js",
    description: "Type-safe backend framework for Next.js. Build scalable APIs with contract-based routing, automatic client generation, Drizzle ORM, transactions, connection pooling, and end-to-end type safety.",
    keywords: [
        "Next.js",
        "TypeScript",
        "Backend",
        "Type-safe",
        "API",
        "REST API",
        "PostgreSQL",
        "Drizzle ORM",
        "Full-stack",
        "Node.js",
        "Contract-based routing",
        "File-based routing",
        "Auto-generated client",
        "Repository pattern",
        "Transactions",
        "Connection pooling",
        "Redis",
        "Hono",
        "CRUD",
    ],
    authors: [{ name: "INFLIKE Inc." }],
    openGraph: {
        title: "SPFN - Type-safe backend for Next.js",
        description: "Next.js handles your frontend. SPFN handles your backend.",
        type: "website",
        locale: "en_US",
        siteName: "SPFN",
        images: [{
            url: '/og.png',
            width: 1200,
            height: 630,
            alt: 'SPFN - Type-safe backend for Next.js',
        }],
    },
    twitter: {
        card: "summary_large_image",
        title: "SPFN - Type-safe backend for Next.js",
        description: "Next.js handles your frontend. SPFN handles your backend.",
        images: ['/og.png'],
    },
};

interface Props {
    children: ReactNode;
}

export default function RootLayout({ children }: Readonly<Props>)
{
    return (
        <html lang="en">
            <body className={`${geistSans.variable} ${jetbrainsMono.variable} ${sansation.variable} antialiased`}>
                { children }
            </body>
        </html>
    );
}
