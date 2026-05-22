"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Infinity,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import {
  countLabel,
  formatDateTime,
  type Language,
  type TranslationKey,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

type PickupFilePreview = {
  key: string;
  bucket: string;
  fileName: string;
  previewName: string;
  isDirectory: boolean;
  size: number | null;
};

type PickupCodeListItem = {
  id: string;
  code: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  fileCount: number;
  totalSize: number | null;
  missingFileCount: number;
  filePreview: PickupFilePreview[];
  previewCount: number;
};

type StatusInfo = {
  labelKey: TranslationKey;
  icon: typeof XCircle;
  className: string;
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
  return formatDateTime(value, language);
}

function getStatus(pickupCode: PickupCodeListItem) {
  if (pickupCode.revokedAt) {
    return {
      labelKey: "common.revoked",
      icon: XCircle,
      className: "text-destructive",
    } satisfies StatusInfo;
  }

  if (!pickupCode.expiresAt) {
    return {
      labelKey: "common.permanent",
      icon: Infinity,
      className: "text-foreground",
    } satisfies StatusInfo;
  }

  if (new Date(pickupCode.expiresAt).getTime() <= Date.now()) {
    return {
      labelKey: "common.expired",
      icon: XCircle,
      className: "text-destructive",
    } satisfies StatusInfo;
  }

  return {
    labelKey: "common.active",
    icon: CheckCircle2,
    className: "text-foreground",
  } satisfies StatusInfo;
}

function getFileSummary(
  pickupCode: PickupCodeListItem,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  if (pickupCode.previewCount === 0) {
    return t("pickup.noFiles");
  }

  const visibleFiles = pickupCode.filePreview.slice(
    0,
    pickupCode.previewCount > 3 ? 2 : 3,
  );
  const names = visibleFiles
    .map((file) =>
      file.isDirectory
        ? t("files.folderName", { name: file.previewName })
        : file.previewName,
    )
    .join(", ");
  const remainingCount = pickupCode.previewCount - visibleFiles.length;

  return remainingCount > 0
    ? t("pickup.moreFiles", { names, count: remainingCount })
    : names;
}

function getFileSearchText(file: PickupFilePreview) {
  return (
    `${file.fileName} ${file.previewName} ${file.key}`.toLocaleLowerCase()
  );
}

async function copyToClipboard(
  text: string,
  message: string,
  failedMessage: string,
) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error(failedMessage);
  }
}

export function PickupCodesManager() {
  const [pickupCodes, setPickupCodes] = useState<PickupCodeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { language, t } = useI18n();

  const fetchPickupCodes = useCallback(async () => {
    const response = await fetch("/api/pickup-codes", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load pickup codes");
    }

    const data = (await response.json()) as {
      pickupCodes: PickupCodeListItem[];
    };
    return data.pickupCodes;
  }, []);

  useEffect(() => {
    let ignore = false;

    void fetchPickupCodes()
      .then((loadedPickupCodes) => {
        if (!ignore) {
          setPickupCodes(loadedPickupCodes);
        }
      })
      .catch(() => {
        if (!ignore) {
          toast.error(t("files.failedLoadPickupCodes"));
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [fetchPickupCodes, t]);

  const refreshPickupCodes = async () => {
    setIsRefreshing(true);

    try {
      setPickupCodes(await fetchPickupCodes());
    } catch {
      toast.error(t("files.failedLoadPickupCodes"));
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredPickupCodes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return pickupCodes;
    }

    return pickupCodes.filter((pickupCode) => {
      return (
        pickupCode.code.toLocaleLowerCase().includes(normalizedQuery) ||
        pickupCode.filePreview.some(
          (file) =>
            getFileSearchText(file).includes(normalizedQuery),
        )
      );
    });
  }, [pickupCodes, searchQuery]);

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-sm font-medium">{t("pickup.cardTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {t("pickup.countSummary", {
                filtered: filteredPickupCodes.length,
                total: pickupCodes.length,
              })}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void refreshPickupCodes()}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t("common.refresh")}
          </Button>
        </div>

        <div className="border-b px-4 py-3">
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("pickup.searchPlaceholder")}
              className="h-9 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-190 table-fixed text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="w-30 px-4 py-3 font-medium">
                  {t("pickup.code")}
                </th>
                <th className="w-28 px-4 py-3 font-medium">
                  {t("pickup.status")}
                </th>
                <th className="px-4 py-3 font-medium">{t("pickup.files")}</th>
                <th className="w-40 px-4 py-3 font-medium">
                  {t("pickup.expires")}
                </th>
                <th className="hidden w-40 px-4 py-3 font-medium lg:table-cell">
                  {t("pickup.created")}
                </th>
                <th className="sticky right-0 w-24 bg-muted/50 px-4 py-3 text-right font-medium shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.45)]">
                  {t("files.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      {t("pickup.loading")}
                    </div>
                  </td>
                </tr>
              ) : filteredPickupCodes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    {t("pickup.empty")}
                  </td>
                </tr>
              ) : (
                filteredPickupCodes.map((pickupCode) => {
                  const status = getStatus(pickupCode);
                  const StatusIcon = status.icon;

                  return (
                    <tr key={pickupCode.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <KeyRound className="size-4 text-muted-foreground" />
                          <span className="font-mono font-semibold">
                            {pickupCode.code}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            "flex items-center gap-1.5",
                            status.className,
                          )}
                        >
                          <StatusIcon className="size-4" />
                          {t(status.labelKey)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate font-medium">
                          {getFileSummary(pickupCode, t)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {countLabel(
                              language,
                              pickupCode.fileCount,
                              "file",
                              "files",
                              "个文件",
                            )}
                          </span>
                          <span>{formatBytes(pickupCode.totalSize)}</span>
                          {pickupCode.missingFileCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <AlertTriangle className="size-3" />
                              {t("pickup.missing", {
                                count: pickupCode.missingFileCount,
                              })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {pickupCode.expiresAt ? (
                          <div>
                            <div>
                              {formatDate(pickupCode.expiresAt, language)}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-xs">
                              <Clock className="size-3" />
                              {t(status.labelKey)}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Infinity className="size-4" />
                            {t("common.neverExpires")}
                          </div>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                        {formatDate(pickupCode.createdAt, language)}
                      </td>
                      <td className="sticky right-0 bg-card px-4 py-3 shadow-[-8px_0_12px_-12px_rgba(0,0,0,0.45)]">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              void copyToClipboard(
                                `${window.location.origin}/pickup?code=${encodeURIComponent(
                                  pickupCode.code,
                                )}`,
                                t("pickup.linkCopied"),
                                t("detail.failedCopy"),
                              )
                            }
                          >
                            <Copy className="size-4" />
                            <span className="sr-only">
                              {t("pickup.copyPickupLink")}
                            </span>
                          </Button>
                          <Button asChild variant="outline" size="icon">
                            <Link href={`/pickup-codes/${pickupCode.id}`}>
                              <ExternalLink className="size-4" />
                              <span className="sr-only">
                                {t("pickup.openDetail")}
                              </span>
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
