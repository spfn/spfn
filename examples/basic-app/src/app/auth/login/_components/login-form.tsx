"use client";

import { AuthError } from "@spfn/auth/errors";
import { authApi } from "@spfn/auth";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Field,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";

export function LoginForm({ className }: React.ComponentProps<"div">)
{
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = searchParams.get('redirect') || '/';

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) =>
    {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try
        {
            const response = await authApi.login.call({ body: { email, password } });
            console.log(response);

            router.replace(redirectTo);
        }
        catch (err)
        {
            if(err instanceof AuthError.InvalidCredentialsError)
            {
                console.error('아이디 불일치');
            }
            else
            {
                console.error(err);
                const error = err as Error;
                setError(error.message);
            }
        }
        finally
        {
            setIsLoading(false);
        }
    };

    return (
        <form className={cn("flex flex-col gap-6", className)} onSubmit={handleSubmit}>
            <FieldGroup>
                <div className="flex flex-col items-center gap-1 text-center">
                    <h1 className="text-2xl font-bold">Login to your account</h1>
                    <p className="text-muted-foreground text-sm text-balance">
                        Enter your email below to login to your account
                    </p>
                </div>

                {error && (
                    <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md text-sm">
                        { error }
                    </div>
                )}

                <div className="bg-muted/50 border border-border px-4 py-3 rounded-md text-sm">
                    <p className="font-medium text-muted-foreground mb-1">Demo Account</p>
                    <p className="text-muted-foreground">
                        Email: <code className="bg-muted px-1 rounded">admin@example.com</code>
                    </p>
                    <p className="text-muted-foreground">
                        Password: <code className="bg-muted px-1 rounded">Admin!@34</code>
                    </p>
                </div>

                <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                        id="email"
                        type="email"
                        placeholder="m@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                    />
                </Field>
                <Field>
                    <div className="flex items-center">
                        <FieldLabel htmlFor="password">Password</FieldLabel>
                    </div>
                    <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                    />
                </Field>
                <Field>
                    <Button type="submit" disabled={isLoading}>
                        { isLoading ? "Logging in..." : "Login" }
                    </Button>
                </Field>
            </FieldGroup>
        </form>
    )
}
