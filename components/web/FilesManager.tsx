"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertDialog, Dialog } from "radix-ui";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Download,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ManagedFile } from "@/lib/files";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const DEFAULT_EXPIRES_IN_MINUTES = 60;

type SortKey = "fileName" | "lastModified" | "presignedUrlExpiresAt";
type SortDirection = "asc" | "desc";
type SortState = {
  key: SortKey;
  direction: SortDirection;
};
type LinkDialogState = {
  file: ManagedFile;
  expiresInMinutes: number;
  isGenerating: boolean;
};

type DeleteDialogState = {
  file: ManagedFile;
  isDeleting: boolean;
};

type DownloadLink = {
  url: string;
  expiresAt: string;
  createdAt: string;
};

function formatBytes(bytes: number) {
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
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sortValue(file: ManagedFile, key: SortKey) {
  if (key === "fileName") {
    return file.fileName.toLocaleLowerCase();
  }

  const value =
    key === "lastModified" ? file.lastModified : file.presignedUrlExpiresAt;

  return value ? new Date(value).getTime() : 0;
}

function isExpired(value: string | null) {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
  } catch {
    toast.error("Failed to copy link");
  }
}

export function FilesManager() {
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({
    key: "lastModified",
    direction: "desc",
  });
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(
    null,
  );

  const fetchFiles = useCallback(async () => {
    const response = await fetch("/api/s3/files", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load files");
    }

    const data = (await response.json()) as { files: ManagedFile[] };
    return data.files;
  }, []);

  useEffect(() => {
    let ignore = false;

    void fetchFiles()
      .then((loadedFiles) => {
        if (!ignore) {
          setFiles(loadedFiles);
        }
      })
      .catch(() => {
        if (!ignore) {
          toast.error("Failed to load files");
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
  }, [fetchFiles]);

  const refreshFiles = async () => {
    setIsRefreshing(true);

    try {
      const loadedFiles = await fetchFiles();
      setFiles(loadedFiles);
      setPage(1);
    } catch {
      toast.error("Failed to load files");
    } finally {
      setIsRefreshing(false);
    }
  };

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const aValue = sortValue(a, sort.key);
      const bValue = sortValue(b, sort.key);
      const result =
        typeof aValue === "string" && typeof bValue === "string"
          ? aValue.localeCompare(bValue)
          : Number(aValue) - Number(bValue);

      return sort.direction === "asc" ? result : -result;
    });
  }, [files, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedFiles.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedFiles = sortedFiles.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const changeSort = (key: SortKey) => {
    setSort((currentSort) => ({
      key,
      direction:
        currentSort.key === key && currentSort.direction === "asc"
          ? "desc"
          : "asc",
    }));
    setPage(1);
  };

  const openLinkDialog = (file: ManagedFile) => {
    setLinkDialog({
      file,
      expiresInMinutes: DEFAULT_EXPIRES_IN_MINUTES,
      isGenerating: false,
    });
  };

  const generateDownloadLink = async () => {
    if (!linkDialog) {
      return;
    }

    setLinkDialog({ ...linkDialog, isGenerating: true });

    try {
      const response = await fetch("/api/s3/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: linkDialog.file.key,
          expiresInSeconds: linkDialog.expiresInMinutes * 60,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate link");
      }

      const data = (await response.json()) as { link: DownloadLink };
      const updatedFile = {
        ...linkDialog.file,
        presignedUrl: data.link.url,
        presignedUrlExpiresAt: data.link.expiresAt,
        presignedUrlCreatedAt: data.link.createdAt,
      };

      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          file.key === updatedFile.key ? updatedFile : file,
        ),
      );
      setLinkDialog({
        file: updatedFile,
        expiresInMinutes: linkDialog.expiresInMinutes,
        isGenerating: false,
      });
      toast.success("Download link generated");
    } catch {
      toast.error("Failed to generate download link");
      setLinkDialog((currentDialog) =>
        currentDialog ? { ...currentDialog, isGenerating: false } : null,
      );
    }
  };

  const deleteFile = async () => {
    if (!deleteDialog) {
      return;
    }

    setDeleteDialog({ ...deleteDialog, isDeleting: true });

    try {
      const response = await fetch("/api/s3/delete", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: deleteDialog.file.key }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete file");
      }

      setFiles((currentFiles) =>
        currentFiles.filter((file) => file.key !== deleteDialog.file.key),
      );
      setDeleteDialog(null);
      toast.success("File deleted");
    } catch {
      toast.error("Failed to delete file");
      setDeleteDialog((currentDialog) =>
        currentDialog ? { ...currentDialog, isDeleting: false } : null,
      );
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sort.key !== key) {
      return <ArrowUpDown className="size-3.5" />;
    }

    return sort.direction === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  };

  return (
    <>
      <Card className="w-full">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <p className="text-sm font-medium">Object storage files</p>
              <p className="text-xs text-muted-foreground">
                {files.length} files in the configured bucket
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => void refreshFiles()}
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

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] table-fixed text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="w-44 px-4 py-3 font-medium">Bucket</th>
                  <th className="w-72 px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1.5"
                      onClick={() => changeSort("fileName")}
                    >
                      File name
                      {renderSortIcon("fileName")}
                    </button>
                  </th>
                  <th className="w-28 px-4 py-3 font-medium">Size</th>
                  <th className="w-44 px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1.5"
                      onClick={() => changeSort("lastModified")}
                    >
                      Uploaded
                      {renderSortIcon("lastModified")}
                    </button>
                  </th>
                  <th className="w-52 px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1.5"
                      onClick={() => changeSort("presignedUrlExpiresAt")}
                    >
                      Link expires
                      {renderSortIcon("presignedUrlExpiresAt")}
                    </button>
                  </th>
                  <th className="w-20 px-4 py-3 text-right font-medium">
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
                        Loading files
                      </div>
                    </td>
                  </tr>
                ) : paginatedFiles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No files found.
                    </td>
                  </tr>
                ) : (
                  paginatedFiles.map((file) => {
                    const expired = isExpired(file.presignedUrlExpiresAt);

                    return (
                      <tr key={file.key} className="border-b last:border-b-0">
                        <td className="truncate px-4 py-3 text-muted-foreground">
                          {file.bucket}
                        </td>
                        <td className="px-4 py-3">
                          <div className="truncate font-medium">
                            {file.fileName}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {file.key}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {formatBytes(file.size)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(file.lastModified)}
                        </td>
                        <td className="px-4 py-3">
                          {file.presignedUrlExpiresAt ? (
                            <div
                              className={cn(
                                "text-muted-foreground",
                                expired && "text-destructive",
                              )}
                            >
                              <div>{formatDate(file.presignedUrlExpiresAt)}</div>
                              {expired && (
                                <div className="text-xs">Expired</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onSelect={() => openLinkDialog(file)}
                              >
                                <Download className="size-4" />
                                Download link
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() =>
                                  setDeleteDialog({
                                    file,
                                    isDeleting: false,
                                  })
                                }
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog.Root
        open={Boolean(linkDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setLinkDialog(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg">
            <Dialog.Title className="text-lg font-semibold">
              Download link
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Generate a presigned URL for this file. S3 allows up to 7 days.
            </Dialog.Description>

            {linkDialog && (
              <div className="mt-5 flex flex-col gap-4">
                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="truncate text-sm font-medium">
                    {linkDialog.file.fileName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {linkDialog.file.key}
                  </p>
                </div>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  Valid for minutes
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={linkDialog.expiresInMinutes}
                    onChange={(event) =>
                      setLinkDialog({
                        ...linkDialog,
                        expiresInMinutes: Number.isFinite(
                          Number(event.target.value),
                        )
                          ? Number(event.target.value)
                          : 0,
                      })
                    }
                    className="h-9 rounded-lg border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </label>

                {linkDialog.file.presignedUrl && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        Existing generated link
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void copyToClipboard(
                            linkDialog.file.presignedUrl as string,
                          )
                        }
                      >
                        <Copy className="size-4" />
                        Copy
                      </Button>
                    </div>
                    <textarea
                      readOnly
                      value={linkDialog.file.presignedUrl}
                      className="min-h-24 resize-none rounded-lg border bg-background p-3 text-xs outline-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Expires {formatDate(linkDialog.file.presignedUrlExpiresAt)}
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">Close</Button>
                  </Dialog.Close>
                  <Button
                    onClick={() => void generateDownloadLink()}
                    disabled={
                      linkDialog.isGenerating ||
                      !Number.isFinite(linkDialog.expiresInMinutes) ||
                      linkDialog.expiresInMinutes < 1 ||
                      linkDialog.expiresInMinutes > 10080
                    }
                  >
                    {linkDialog.isGenerating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Generate new link
                  </Button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AlertDialog.Root
        open={Boolean(deleteDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialog(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg">
            <AlertDialog.Title className="text-lg font-semibold">
              Delete this file?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              This will permanently remove the object from S3 and clear its
              saved download link.
            </AlertDialog.Description>

            {deleteDialog && (
              <p className="mt-3 truncate rounded-md bg-muted px-3 py-2 text-sm">
                {deleteDialog.file.fileName}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline" disabled={deleteDialog?.isDeleting}>
                  Keep
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  onClick={(event) => {
                    event.preventDefault();
                    void deleteFile();
                  }}
                  disabled={deleteDialog?.isDeleting}
                >
                  {deleteDialog?.isDeleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Delete
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
