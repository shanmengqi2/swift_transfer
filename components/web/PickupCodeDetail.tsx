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
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { AlertDialog } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
      label: "Revoked",
      icon: XCircle,
      className: "text-destructive",
    };
  }

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

async function copyToClipboard(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Failed to copy");
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
          toast.error("Failed to load pickup code");
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
  }, [fetchPickupCode]);

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

  const saveExpiration = async () => {
    if (!pickupCode) {
      return;
    }

    if (!neverExpires && !expiresAtInput) {
      toast.error("Choose an expiration time or select never expires");
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
      toast.success("Expiration updated");
    } catch {
      toast.error("Failed to update expiration");
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
      toast.success("Pickup code revoked");
    } catch {
      toast.error("Failed to revoke pickup code");
    } finally {
      setIsRevoking(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading pickup code
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!pickupCode) {
    return (
      <Card className="w-full">
        <CardContent className="p-12 text-center text-muted-foreground">
          Pickup code not found.
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
            Back
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
                    {status.label}
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pickupCode.files.length} file
                  {pickupCode.files.length === 1 ? "" : "s"} ·{" "}
                  {formatBytes(totalSize)}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => void copyToClipboard(pickupLink, "Link copied")}
              >
                <Copy className="size-4" />
                Copy pickup link
              </Button>
            </div>

            <div className="divide-y">
              {pickupCode.files.map((file) => (
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
                  {file.exists ? (
                    <span className="text-sm text-muted-foreground">
                      Available
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-sm text-destructive">
                      <AlertTriangle className="size-4" />
                      File missing
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 p-4">
              <div>
                <p className="text-sm font-medium">Expiration</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Current: {formatDate(pickupCode.expiresAt)}
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
                Never expires
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
                Save expiration
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div>
                <p className="text-sm font-medium">Metadata</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {formatDate(pickupCode.createdAt)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {formatDate(pickupCode.updatedAt)}
                </p>
                {pickupCode.revokedAt && (
                  <p className="mt-1 text-xs text-destructive">
                    Revoked {formatDate(pickupCode.revokedAt)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div>
                <p className="text-sm font-medium">Revoke code</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Revoked pickup codes can no longer be used on the public
                  pickup page.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setRevokeDialogOpen(true)}
                disabled={Boolean(pickupCode.revokedAt)}
              >
                <Trash2 className="size-4" />
                Revoke
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
              Revoke this pickup code?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              The public pickup page will stop accepting this code. Any
              presigned download URLs already copied may remain valid until
              their own expiration.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline" disabled={isRevoking}>
                  Keep
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
                  Revoke
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
