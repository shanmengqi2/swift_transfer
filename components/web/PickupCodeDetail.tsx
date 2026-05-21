"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Infinity,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
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

type PickupFile = {
  key: string;
  bucket: string;
  fileName: string;
  size: number | null;
  exists: boolean;
};

type PickupCodeDetailData = {
  id: string;
  code: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  files: PickupFile[];
};

type StorageFile = {
  bucket: string;
  key: string;
  fileName: string;
  displayPath: string;
  size: number;
};

type PickupCodeDetailProps = {
  id: string;
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

type StatusInfo = {
  labelKey: TranslationKey;
  icon: typeof XCircle;
  className: string;
};

function formatDate(value: string | null, language: Language) {
  return formatDateTime(value, language);
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string) {
  return new Date(value).toISOString();
}

function getStatus(pickupCode: PickupCodeDetailData) {
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

export function PickupCodeDetail({ id }: PickupCodeDetailProps) {
  const [pickupCode, setPickupCode] = useState<PickupCodeDetailData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [neverExpires, setNeverExpires] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [storageFiles, setStorageFiles] = useState<StorageFile[]>([]);
  const [isLoadingStorageFiles, setIsLoadingStorageFiles] = useState(false);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [selectedAddKeys, setSelectedAddKeys] = useState<Set<string>>(
    new Set(),
  );
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const { language, t } = useI18n();

  const fetchPickupCode = useCallback(async () => {
    const response = await fetch(`/api/pickup-codes/${id}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load pickup code");
    }

    const data = (await response.json()) as {
      pickupCode: PickupCodeDetailData;
    };
    return data.pickupCode;
  }, [id]);

  useEffect(() => {
    let ignore = false;

    void fetchPickupCode()
      .then((loadedPickupCode) => {
        if (!ignore) {
          setPickupCode(loadedPickupCode);
          setNeverExpires(loadedPickupCode.expiresAt === null);
          setExpiresAtInput(toLocalDateTimeInput(loadedPickupCode.expiresAt));
        }
      })
      .catch(() => {
        if (!ignore) {
          toast.error(t("detail.failedLoadPickupCode"));
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
  }, [fetchPickupCode, t]);

  const totalSize = useMemo(() => {
    if (!pickupCode) {
      return null;
    }

    return pickupCode.files.reduce<number | null>((total, file) => {
      if (file.size === null) {
        return total;
      }

      return (total ?? 0) + file.size;
    }, null);
  }, [pickupCode]);

  const currentFileKeys = useMemo(
    () => new Set(pickupCode?.files.map((file) => file.key) ?? []),
    [pickupCode],
  );

  const addableFiles = useMemo(() => {
    const normalizedQuery = addSearchQuery.trim().toLocaleLowerCase();

    return storageFiles.filter((file) => {
      if (currentFileKeys.has(file.key)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        file.fileName.toLocaleLowerCase().includes(normalizedQuery) ||
        file.displayPath.toLocaleLowerCase().includes(normalizedQuery) ||
        file.key.toLocaleLowerCase().includes(normalizedQuery)
      );
    });
  }, [addSearchQuery, currentFileKeys, storageFiles]);

  const openAddDialog = async () => {
    setAddDialogOpen(true);
    setSelectedAddKeys(new Set());
    setAddSearchQuery("");
    setIsLoadingStorageFiles(true);

    try {
      const response = await fetch("/api/s3/files", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load files");
      }

      const data = (await response.json()) as { files: StorageFile[] };
      setStorageFiles(data.files);
    } catch {
      toast.error(t("files.failedLoad"));
    } finally {
      setIsLoadingStorageFiles(false);
    }
  };

  const saveExpiration = async () => {
    if (!pickupCode) {
      return;
    }

    if (!neverExpires && !expiresAtInput) {
      toast.error(t("detail.chooseExpiration"));
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/pickup-codes/${pickupCode.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update-expiration",
          expiresAt: neverExpires
            ? null
            : fromLocalDateTimeInput(expiresAtInput),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update expiration");
      }

      const data = (await response.json()) as {
        pickupCode: PickupCodeDetailData;
      };
      setPickupCode((current) =>
        current
          ? {
              ...current,
              expiresAt: data.pickupCode.expiresAt,
              updatedAt: data.pickupCode.updatedAt,
              revokedAt: data.pickupCode.revokedAt,
            }
          : current,
      );
      toast.success(t("detail.expirationUpdated"));
    } catch {
      toast.error(t("detail.failedUpdateExpiration"));
    } finally {
      setIsSaving(false);
    }
  };

  const revokeCode = async () => {
    if (!pickupCode) {
      return;
    }

    setIsRevoking(true);

    try {
      const response = await fetch(`/api/pickup-codes/${pickupCode.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });

      if (!response.ok) {
        throw new Error("Failed to revoke pickup code");
      }

      const data = (await response.json()) as {
        pickupCode: PickupCodeDetailData;
      };
      setPickupCode((current) =>
        current
          ? {
              ...current,
              updatedAt: data.pickupCode.updatedAt,
              revokedAt: data.pickupCode.revokedAt,
            }
          : current,
      );
      setRevokeDialogOpen(false);
      toast.success(t("detail.revoked"));
    } catch {
      toast.error(t("detail.failedRevoke"));
    } finally {
      setIsRevoking(false);
    }
  };

  const toggleAddFileSelection = (key: string) => {
    setSelectedAddKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }

      return nextKeys;
    });
  };

  const addSelectedFiles = async () => {
    if (!pickupCode || selectedAddKeys.size === 0) {
      return;
    }

    setIsAddingFiles(true);

    try {
      const selectedFiles = storageFiles.filter((file) =>
        selectedAddKeys.has(file.key),
      );
      const response = await fetch(`/api/pickup-codes/${pickupCode.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "add-files",
          files: selectedFiles.map((file) => ({
            key: file.key,
            bucket: file.bucket,
            fileName: file.displayPath,
            size: file.size,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add files");
      }

      const data = (await response.json()) as {
        pickupCode: PickupCodeDetailData;
      };
      setPickupCode(data.pickupCode);
      setSelectedAddKeys(new Set());
      setAddDialogOpen(false);
      toast.success(
        selectedFiles.length === 1
          ? t("detail.fileAdded")
          : t("detail.filesAdded"),
      );
    } catch {
      toast.error(t("detail.failedAddFiles"));
    } finally {
      setIsAddingFiles(false);
    }
  };

  const removeFile = async (file: PickupFile) => {
    if (!pickupCode) {
      return;
    }

    setRemovingKey(file.key);

    try {
      const response = await fetch(`/api/pickup-codes/${pickupCode.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "remove-file",
          key: file.key,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to remove file");
      }

      const data = (await response.json()) as {
        pickupCode: PickupCodeDetailData;
      };
      setPickupCode(data.pickupCode);
      toast.success(t("detail.fileRemoved"));
    } catch {
      toast.error(t("detail.failedRemoveFile"));
    } finally {
      setRemovingKey(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("detail.loading")}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!pickupCode) {
    return (
      <Card className="w-full">
        <CardContent className="p-12 text-center text-muted-foreground">
          {t("detail.notFound")}
        </CardContent>
      </Card>
    );
  }

  const status = getStatus(pickupCode);
  const StatusIcon = status.icon;
  const pickupLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/pickup?code=${encodeURIComponent(
          pickupCode.code,
        )}`;

  return (
    <>
      <div className="mb-5">
        <Button asChild variant="outline">
          <Link href="/pickup-codes">
            <ArrowLeft className="size-4" />
            {t("common.back")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="w-full">
          <CardContent className="p-0">
            <div className="flex flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-mono text-3xl font-semibold tracking-normal">
                    {pickupCode.code}
                  </p>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 text-sm",
                      status.className,
                    )}
                    >
                      <StatusIcon className="size-4" />
                    {t(status.labelKey)}
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {countLabel(
                    language,
                    pickupCode.files.length,
                    "file",
                    "files",
                    "个文件",
                  )}{" "}
                  ·{" "}
                  {formatBytes(totalSize)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    void copyToClipboard(
                      pickupLink,
                      t("detail.linkCopied"),
                      t("detail.failedCopy"),
                    )
                  }
                >
                  <Copy className="size-4" />
                  {t("detail.copyPickupLink")}
                </Button>
                <Button
                  onClick={() => void openAddDialog()}
                  disabled={Boolean(pickupCode.revokedAt)}
                >
                  <Plus className="size-4" />
                  {t("detail.addFiles")}
                </Button>
              </div>
            </div>

            <div className="divide-y">
              {pickupCode.files.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {t("detail.noFiles")}
                </div>
              ) : (
                pickupCode.files.map((file) => (
                  <div
                    key={file.key}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {file.fileName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {file.key}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {file.exists ? (
                        <span className="text-sm text-muted-foreground">
                          {t("common.available")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-sm text-destructive">
                          <AlertTriangle className="size-4" />
                          {t("common.fileMissing")}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void removeFile(file)}
                        disabled={
                          Boolean(pickupCode.revokedAt) ||
                          removingKey === file.key
                        }
                      >
                        {removingKey === file.key ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                        {t("common.remove")}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 p-4">
              <div>
                <p className="text-sm font-medium">{t("detail.expiration")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("detail.current", {
                    date: formatDate(pickupCode.expiresAt, language),
                  })}
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={neverExpires}
                  onChange={(event) => setNeverExpires(event.target.checked)}
                  disabled={Boolean(pickupCode.revokedAt)}
                  className="size-4 rounded border-border accent-primary"
                />
                {t("common.neverExpires")}
              </label>

              <input
                type="datetime-local"
                value={expiresAtInput}
                onChange={(event) => setExpiresAtInput(event.target.value)}
                disabled={neverExpires || Boolean(pickupCode.revokedAt)}
                className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />

              <Button
                onClick={() => void saveExpiration()}
                disabled={isSaving || Boolean(pickupCode.revokedAt)}
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {t("detail.saveExpiration")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{t("detail.metadata")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("detail.created", {
                    date: formatDate(pickupCode.createdAt, language),
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("detail.updated", {
                    date: formatDate(pickupCode.updatedAt, language),
                  })}
                </p>
                {pickupCode.revokedAt && (
                  <p className="mt-1 text-xs text-destructive">
                    {t("detail.revokedAt", {
                      date: formatDate(pickupCode.revokedAt, language),
                    })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{t("detail.revokeCode")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("detail.revokeDescription")}
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setRevokeDialogOpen(true)}
                disabled={Boolean(pickupCode.revokedAt)}
              >
                <Trash2 className="size-4" />
                {t("detail.revoke")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog.Root
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg">
            <AlertDialog.Title className="text-lg font-semibold">
              {t("detail.revokeTitle")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              {t("detail.revokeConfirm")}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline" disabled={isRevoking}>
                  {t("common.keep")}
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  disabled={isRevoking}
                  onClick={(event) => {
                    event.preventDefault();
                    void revokeCode();
                  }}
                >
                  {isRevoking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {t("detail.revoke")}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <Dialog.Root open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-lg">
            <div className="border-b p-5">
              <Dialog.Title className="text-lg font-semibold">
                {t("detail.addFiles")}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {t("detail.addFilesDescription")}
              </Dialog.Description>
            </div>

            <div className="border-b p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={addSearchQuery}
                  onChange={(event) => setAddSearchQuery(event.target.value)}
                  placeholder={t("detail.searchFiles")}
                  className="h-9 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
            </div>

            <div className="min-h-60 flex-1 overflow-y-auto">
              {isLoadingStorageFiles ? (
                <div className="flex items-center justify-center gap-2 px-4 py-12 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("files.loading")}
                </div>
              ) : addableFiles.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {t("detail.noFilesAvailable")}
                </div>
              ) : (
                <div className="divide-y">
                  {addableFiles.map((file) => (
                    <label
                      key={file.key}
                      className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAddKeys.has(file.key)}
                        onChange={() => toggleAddFileSelection(file.key)}
                        className="mt-1 size-4 rounded border-border accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {file.displayPath}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {file.key}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatBytes(file.size)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t p-4">
              <p className="text-xs text-muted-foreground">
                {t("files.selected", { count: selectedAddKeys.size })}
              </p>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button variant="outline" disabled={isAddingFiles}>
                    {t("common.close")}
                  </Button>
                </Dialog.Close>
                <Button
                  onClick={() => void addSelectedFiles()}
                  disabled={isAddingFiles || selectedAddKeys.size === 0}
                >
                  {isAddingFiles ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {t("detail.addSelected")}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
