import type { ReactNode } from "react";
import { getSession } from "@spfn/auth/nextjs/server";
import { redirect } from "next/navigation";

interface ExampleLayoutProps
{
    children: ReactNode;
}

export default async function ExampleLayout({ children }: ExampleLayoutProps)
{
    const session = await getSession();
    if (!session)
    {
        redirect('/auth/login?redirect=/examples');
    }

    return <>{children}</>;
}