"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
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
import { cn } from "@/lib/utils";

type PickupFilePreview = {
  key: string;
  bucket: string;
  fileName: string;
  size: number | null;
};

type PickupCodeListItem = {
  id: string;
  code: string;
  expiresAt: string | null;
  createdAt: string;
  fileCount: number;
  totalSize: number | null;
  missingFileCount: number;
  filePreview: PickupFilePreview[];
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

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatus(pickupCode: PickupCodeListItem) {
  if (!pickupCode.expiresAt) {
    return {
      label: "Permanent",
      icon: Infinity,
      className: "text-foreground",
    };
  }

  if (new Date(pickupCode.expiresAt).getTime() <= Date.now()) {
    return {
      label: "Expired",
      icon: XCircle,
      className: "text-destructive",
    };
  }

  return {
    label: "Active",
    icon: CheckCircle2,
    className: "text-foreground",
  };
}

function getFileSummary(pickupCode: PickupCodeListItem) {
  if (pickupCode.fileCount === 0) {
    return "No files";
  }

  const visibleFiles = pickupCode.filePreview.slice(
    0,
    pickupCode.fileCount > 3 ? 2 : 3,
  );
  const names = visibleFiles.map((file) => file.fileName).join(", ");
  const remainingCount = pickupCode.fileCount - visibleFiles.length;

  return remainingCount > 0 ? `${names} + ${remainingCount} more` : names;
}

async function copyToClipboard(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Failed to copy");
  }
}

export function PickupCodesManager() {
  const [pickupCodes, setPickupCodes] = useState<PickupCodeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
          toast.error("Failed to load pickup codes");
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
  }, [fetchPickupCodes]);

  const refreshPickupCodes = async () => {
    setIsRefreshing(true);

    try {
      setPickupCodes(await fetchPickupCodes());
    } catch {
      toast.error("Failed to load pickup codes");
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
            file.fileName.toLocaleLowerCase().includes(normalizedQuery) ||
            file.key.toLocaleLowerCase().includes(normalizedQuery),
        )
      );
    });
  }, [pickupCodes, searchQuery]);

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-sm font-medium">Pickup codes</p>
            <p className="text-xs text-muted-foreground">
              {filteredPickupCodes.length} of {pickupCodes.length} codes
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
            Refresh
          </Button>
        </div>

        <div className="border-b px-4 py-3">
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search code or file"
              className="h-9 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-245 table-fixed text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="w-36 px-4 py-3 font-medium">Code</th>
                <th className="w-32 px-4 py-3 font-medium">Status</th>
                <th className="w-110 px-4 py-3 font-medium">Files</th>
                <th className="w-44 px-4 py-3 font-medium">Expires</th>
                <th className="w-44 px-4 py-3 font-medium">Created</th>
                <th className="w-28 px-4 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading pickup codes
                    </div>
                  </td>
                </tr>
              ) : filteredPickupCodes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No pickup codes found.
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
                          {status.label}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate font-medium">
                          {getFileSummary(pickupCode)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {pickupCode.fileCount} file
                            {pickupCode.fileCount === 1 ? "" : "s"}
                          </span>
                          <span>{formatBytes(pickupCode.totalSize)}</span>
                          {pickupCode.missingFileCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <AlertTriangle className="size-3" />
                              {pickupCode.missingFileCount} missing
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {pickupCode.expiresAt ? (
                          <div>
                            <div>{formatDate(pickupCode.expiresAt)}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-xs">
                              <Clock className="size-3" />
                              {status.label}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Infinity className="size-4" />
                            Never expires
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(pickupCode.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              void copyToClipboard(
                                `${window.location.origin}/pickup?code=${encodeURIComponent(
                                  pickupCode.code,
                                )}`,
                                "Pickup link copied",
                              )
                            }
                          >
                            <Copy className="size-4" />
                            <span className="sr-only">Copy pickup link</span>
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
