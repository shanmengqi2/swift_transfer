"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError(true);
        return;
      }

      router.replace(searchParams.get("next") || "/files");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-normal">
          {t("auth.signInTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("auth.signInDescription")}
        </p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex w-full flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="text-sm font-medium">
            {t("auth.username")}
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            {t("auth.password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive">{t("auth.error.unable")}</p>
        ) : null}

        <Button type="submit" className="h-10" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          {t("auth.signIn")}
        </Button>
      </form>
    </>
  );
}
