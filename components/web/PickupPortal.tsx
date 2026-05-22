"use client";

import { FormEvent, useState } from "react";
import {
  ChevronRight,
  Download,
  Folder,
  Home,
  KeyRound,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import { countLabel, formatDateTime, type Language } from "@/lib/i18n";

type PickupFile = {
  key: string;
  bucket: string;
  fileName: string;
  size: number | null;
  exists: boolean;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
};

type PickupResult = {
  code: string;
  expiresAt: string | null;
  files: PickupFile[];
};

type PickupDirectoryEntry = {
  type: "directory";
  id: string;
  name: string;
  path: string;
  fileCount: number;
  totalSize: number;
};

type PickupFileEntry = {
  type: "file";
  id: string;
  file: PickupFile;
};

function formatBytes(bytes: number | null) {
  if (bytes === null) {
    return "-";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${
    units[unitIndex]
  }`;
}

function formatDate(value: string | null, language: Language) {
  return formatDateTime(value, language, "common.neverExpires");
}

function normalizePath(path: string) {
  return path.replace(/^\/+|\/+$/g, "");
}

function getPathCrumbs(path: string) {
  const segments = normalizePath(path).split("/").filter(Boolean);

  return segments.map((segment, index) => ({
    name: segment,
    path: segments.slice(0, index + 1).join("/"),
  }));
}

function buildPickupEntries(files: PickupFile[], currentPath: string) {
  const directories = new Map<string, PickupDirectoryEntry>();
  const directFiles: PickupFileEntry[] = [];
  const currentPrefix = currentPath ? `${currentPath}/` : "";

  for (const file of files) {
    if (!file.fileName.startsWith(currentPrefix)) {
      continue;
    }

    const remainder = file.fileName.slice(currentPrefix.length);

    if (!remainder.includes("/")) {
      directFiles.push({ type: "file", id: file.key, file });
      continue;
    }

    const [directoryName] = remainder.split("/");
    const directoryPath = currentPath
      ? `${currentPath}/${directoryName}`
      : directoryName;
    const directory = directories.get(directoryPath) ?? {
      type: "directory",
      id: `directory:${directoryPath}`,
      name: directoryName,
      path: directoryPath,
      fileCount: 0,
      totalSize: 0,
    };

    directory.fileCount += 1;
    directory.totalSize += file.size ?? 0;
    directories.set(directoryPath, directory);
  }

  return [...directories.values(), ...directFiles].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }

    const aName = a.type === "directory" ? a.name : a.file.fileName;
    const bName = b.type === "directory" ? b.name : b.file.fileName;

    return aName.localeCompare(bName);
  });
}

type PickupPortalProps = {
  initialCode?: string;
};

export function PickupPortal({ initialCode = "" }: PickupPortalProps) {
  const [code, setCode] = useState(initialCode);
  const [isResolving, setIsResolving] = useState(false);
  const [pickup, setPickup] = useState<PickupResult | null>(null);
  const [currentPath, setCurrentPath] = useState("");
  const { language, t } = useI18n();
  const entries = pickup ? buildPickupEntries(pickup.files, currentPath) : [];

  const openDirectory = (path: string) => {
    setCurrentPath(path);
  };

  const resolvePickupCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedCode = code.trim();
    if (normalizedCode.length !== 6) {
      toast.error(t("pickup.codeLength"));
      return;
    }

    setIsResolving(true);

    try {
      const response = await fetch("/api/pickup/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });

      if (!response.ok) {
        throw new Error("Invalid pickup code");
      }

      const data = (await response.json()) as { pickup: PickupResult };
      setPickup(data.pickup);
      setCurrentPath("");
    } catch {
      setPickup(null);
      toast.error(t("pickup.invalid"));
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <KeyRound className="size-4" />
          {t("common.brand")}
        </div>
        <h1 className="text-3xl font-bold tracking-normal sm:text-4xl">
          {t("pickup.portalTitle")}
        </h1>
      </div>

      <Card className="w-full">
        <CardContent className="p-0">
          <form
            onSubmit={(event) => void resolvePickupCode(event)}
            className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row"
          >
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .replace(/[^0-9A-Za-z]/g, "")
                      .slice(0, 6),
                  )
                }
                placeholder={t("pickup.enterCode")}
                className="h-9 w-full rounded-lg border bg-background pr-3 pl-9 font-mono text-sm tracking-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <Button
              type="submit"
              disabled={isResolving || code.trim().length !== 6}
            >
              {isResolving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {t("pickup.open")}
            </Button>
          </form>

          {pickup ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <p className="font-mono text-sm font-semibold">
                    {pickup.code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(pickup.expiresAt, language)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {countLabel(language, pickup.files.length, "file", "files", "个文件")}
                </p>
              </div>

              <div className="divide-y">
                <div className="flex flex-wrap items-center gap-1 px-4 py-2 text-sm">
                  <Button
                    type="button"
                    variant={currentPath ? "ghost" : "outline"}
                    size="sm"
                    onClick={() => openDirectory("")}
                    aria-label={t("files.goRoot")}
                  >
                    <Home className="size-4" />
                    {t("files.rootFolder")}
                  </Button>
                  {getPathCrumbs(currentPath).map((crumb) => (
                    <div key={crumb.path} className="flex items-center gap-1">
                      <ChevronRight className="size-4 text-muted-foreground" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openDirectory(crumb.path)}
                      >
                        {crumb.name}
                      </Button>
                    </div>
                  ))}
                </div>
                {entries.map((entry) => {
                  if (entry.type === "directory") {
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
                        onClick={() => openDirectory(entry.path)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {entry.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {t("files.folderSummary", {
                                count: entry.fileCount,
                              })}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatBytes(entry.totalSize)}
                        </span>
                      </button>
                    );
                  }

                  const file = entry.file;

                  return (
                    <div
                      key={file.key}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {file.fileName.split("/").at(-1) ?? file.fileName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {file.key}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatBytes(file.size)}
                          {file.exists && file.downloadUrlExpiresAt
                            ? ` · ${t("pickup.linkExpires", {
                                date: formatDate(
                                  file.downloadUrlExpiresAt,
                                  language,
                                ),
                              })}`
                            : ""}
                        </p>
                      </div>
                      {file.exists && file.downloadUrl ? (
                        <Button asChild className="sm:self-center">
                          <a href={file.downloadUrl}>
                            <Download className="size-4" />
                            {t("pickup.download")}
                          </a>
                        </Button>
                      ) : (
                        <span className="rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">
                          {t("common.fileMissing")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t("pickup.emptyPrompt")}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
