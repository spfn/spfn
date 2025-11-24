"use client";

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Field,
    FieldGroup,
    FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authApi } from "@spfn/auth/nextjs/api";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export function LoginForm({ className }: React.ComponentProps<"div">)
{
    const router = useRouter();
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
            // Call auto-generated API with interceptor handling
            const result = await authApi.login({
                body: {
                    email,
                    password,
                }
            });

            if (!result.success)
            {
                setError(result.error.message || "Login failed");
                setIsLoading(false);
                return;
            }

            // Login successful - redirect to dashboard or home
            router.push("/admin");
            router.refresh();
        }
        catch (err)
        {
            const error = err as Error;
            setError(error.message);
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
