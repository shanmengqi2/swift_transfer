"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeftRight,
  KeyRound,
  Loader2,
  LogOut,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  activePage: "upload" | "files" | "pickup-codes";
  username?: string;
};

export function PageHeader({
  titleKey,
  descriptionKey,
  activePage,
  username,
}: PageHeaderProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { t } = useI18n();

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
          {t(titleKey)}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {t(descriptionKey)}
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
              {t("nav.upload")}
            </Link>
          </Button>
          <Button
            asChild
            variant={activePage === "files" ? "default" : "outline"}
            className={cn(activePage === "files" && "pointer-events-none")}
          >
            <Link href="/files">
              <ArrowLeftRight className="size-4" />
              {t("nav.files")}
            </Link>
          </Button>
          <Button
            asChild
            variant={activePage === "pickup-codes" ? "default" : "outline"}
            className={cn(
              activePage === "pickup-codes" && "pointer-events-none",
            )}
          >
            <Link href="/pickup-codes">
              <KeyRound className="size-4" />
              {t("nav.pickupCodes")}
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
            {t("nav.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
