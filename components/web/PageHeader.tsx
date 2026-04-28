"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeftRight,
  Loader2,
  LogOut,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description: string;
  activePage: "upload" | "files";
  username?: string;
};

export function PageHeader({
  title,
  description,
  activePage,
  username,
}: PageHeaderProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const signOut = async () => {
    setIsSigningOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  };

  return (
    <div className="mb-8 flex w-full flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-normal sm:text-4xl">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            variant={activePage === "upload" ? "default" : "outline"}
            className={cn(activePage === "upload" && "pointer-events-none")}
          >
            <Link href="/">
              <UploadCloud className="size-4" />
              Upload
            </Link>
          </Button>
          <Button
            asChild
            variant={activePage === "files" ? "default" : "outline"}
            className={cn(activePage === "files" && "pointer-events-none")}
          >
            <Link href="/files">
              <ArrowLeftRight className="size-4" />
              Manage files
            </Link>
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {username ? (
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <UserRound className="size-4 shrink-0" />
              <span className="max-w-40 truncate font-medium text-foreground sm:max-w-56">
                {username}
              </span>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={signOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
