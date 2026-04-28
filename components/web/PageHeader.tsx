"use client";

import Link from "next/link";
import { ArrowLeftRight, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description: string;
  activePage: "upload" | "files";
};

export function PageHeader({
  title,
  description,
  activePage,
}: PageHeaderProps) {
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

      <div className="flex w-full flex-wrap gap-2">
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
    </div>
  );
}
