"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertDialog, Dialog } from "radix-ui";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Folder,
  Home,
  Infinity as InfinityIcon,
  KeyRound,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
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
import { useI18n } from "@/components/i18n-provider";
import type { ManagedFile } from "@/lib/files";
import {
  countLabel,
  formatDateTime,
  type Language,
  type TranslationKey,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const DEFAULT_EXPIRES_IN_MINUTES = 60;
const PICKUP_FILE_LIMIT = 100;

type SortKey = "fileName" | "lastModified" | "presignedUrlExpiresAt";
type SortDirection = "asc" | "desc";
type SortState = {
  key: SortKey;
  direction: SortDirection;
};
type LinkDialogState = {
  file: ManagedFile;
  expiresInMinutes: string;
  isGenerating: boolean;
};

type DirectoryLinkDialogState = {
  directory: DirectoryEntry;
  expiresInMinutes: string;
  isGenerating: boolean;
  links: DownloadLinkResult[];
};

type DeleteDialogState = {
  files: ManagedFile[];
  isDeleting: boolean;
};

type PickupDialogState = {
  files: ManagedFile[];
  expiresInMinutes: string;
  neverExpires: boolean;
  isCreating: boolean;
  pickupCode: {
    code: string;
    expiresAt: string | null;
  } | null;
};

type RelatedPickupCode = {
  id: string;
  code: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  fileCount: number;
};

type RelatedPickupDialogState = {
  file: ManagedFile;
  pickupCodes: RelatedPickupCode[];
  isLoading: boolean;
};

type RelatedDirectoryPickupDialogState = {
  directory: DirectoryEntry;
  pickupCodes: RelatedPickupCode[];
  isLoading: boolean;
};

type RelatedPickupCodeStatus = {
  labelKey: TranslationKey;
  icon: typeof XCircle;
  className: string;
};

type DownloadLink = {
  url: string;
  expiresAt: string;
  createdAt: string;
};

type DownloadLinkResult = DownloadLink & {
  key: string;
  fileName: string;
};

type DirectoryEntry = {
  type: "directory";
  id: string;
  name: string;
  path: string;
  fileCount: number;
  totalSize: number;
  lastModified: string | null;
  descendantFiles: ManagedFile[];
};

type FileEntry = {
  type: "file";
  id: string;
  file: ManagedFile;
};

type BrowserEntry = DirectoryEntry | FileEntry;

type ExpiryPreset = {
  labelKey: TranslationKey;
  minutes: string;
};

const EXPIRY_PRESETS: ExpiryPreset[] = [
  { labelKey: "time.hour1", minutes: "60" },
  { labelKey: "time.day1", minutes: "1440" },
  { labelKey: "time.day7", minutes: "10080" },
];

const PICKUP_EXPIRY_PRESETS: ExpiryPreset[] = [
  { labelKey: "time.day1", minutes: "1440" },
  { labelKey: "time.day7", minutes: "10080" },
  { labelKey: "time.day30", minutes: "43200" },
];

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

function formatDate(value: string | null, language: Language) {
  if (!value) {
    return "-";
  }

  return formatDateTime(value, language);
}

function sortValue(file: ManagedFile, key: SortKey) {
  if (key === "fileName") {
    return file.fileName.toLocaleLowerCase();
  }

  const value =
    key === "lastModified" ? file.lastModified : file.presignedUrlExpiresAt;

  return value ? new Date(value).getTime() : 0;
}

function entrySortValue(entry: BrowserEntry, key: SortKey) {
  if (entry.type === "directory") {
    if (key === "fileName") {
      return entry.name.toLocaleLowerCase();
    }

    return entry.lastModified ? new Date(entry.lastModified).getTime() : 0;
  }

  return sortValue(entry.file, key);
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

function buildDirectoryEntries(files: ManagedFile[], currentPath: string) {
  const directories = new Map<string, DirectoryEntry>();
  const directFiles: FileEntry[] = [];
  const currentPrefix = currentPath ? `${currentPath}/` : "";

  for (const file of files) {
    const displayPath = file.displayPath;

    if (file.parentPath === currentPath) {
      directFiles.push({ type: "file", id: file.key, file });
      continue;
    }

    if (!displayPath.startsWith(currentPrefix)) {
      continue;
    }

    const remainder = displayPath.slice(currentPrefix.length);
    const [directoryName] = remainder.split("/");

    if (!directoryName || !remainder.includes("/")) {
      continue;
    }

    const directoryPath = currentPath
      ? `${currentPath}/${directoryName}`
      : directoryName;
    const currentDirectory = directories.get(directoryPath) ?? {
      type: "directory",
      id: `directory:${directoryPath}`,
      name: directoryName,
      path: directoryPath,
      fileCount: 0,
      totalSize: 0,
      lastModified: null,
      descendantFiles: [],
    };

    currentDirectory.fileCount += 1;
    currentDirectory.totalSize += file.size;
    currentDirectory.descendantFiles.push(file);

    if (
      file.lastModified &&
      (!currentDirectory.lastModified ||
        new Date(file.lastModified).getTime() >
          new Date(currentDirectory.lastModified).getTime())
    ) {
      currentDirectory.lastModified = file.lastModified;
    }

    directories.set(directoryPath, currentDirectory);
  }

  return [...directories.values(), ...directFiles];
}

function getEntrySearchText(entry: BrowserEntry) {
  if (entry.type === "directory") {
    return `${entry.name} ${entry.path}`.toLocaleLowerCase();
  }

  return `${entry.file.fileName} ${entry.file.displayPath} ${entry.file.key}`.toLocaleLowerCase();
}

function getEntrySelectableKeys(entry: BrowserEntry) {
  return entry.type === "directory"
    ? entry.descendantFiles.map((file) => file.key)
    : [entry.file.key];
}

function isExpired(value: string | null) {
  return value ? new Date(value).getTime() <= Date.now() : false;
}

function getPickupCodeStatus(pickupCode: RelatedPickupCode) {
  if (pickupCode.revokedAt) {
    return {
      labelKey: "common.revoked",
      icon: XCircle,
      className: "text-destructive",
    } satisfies RelatedPickupCodeStatus;
  }

  if (!pickupCode.expiresAt) {
    return {
      labelKey: "common.permanent",
      icon: InfinityIcon,
      className: "text-foreground",
    } satisfies RelatedPickupCodeStatus;
  }

  if (isExpired(pickupCode.expiresAt)) {
    return {
      labelKey: "common.expired",
      icon: XCircle,
      className: "text-destructive",
    } satisfies RelatedPickupCodeStatus;
  }

  return {
    labelKey: "common.active",
    icon: CheckCircle2,
    className: "text-foreground",
  } satisfies RelatedPickupCodeStatus;
}

async function copyToClipboard(
  text: string,
  successMessage: string,
  failedMessage: string,
) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error(failedMessage);
  }
}

export function FilesManager() {
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [currentPath, setCurrentPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>({
    key: "lastModified",
    direction: "desc",
  });
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const [directoryLinkDialog, setDirectoryLinkDialog] =
    useState<DirectoryLinkDialogState | null>(null);
  const [pickupDialog, setPickupDialog] = useState<PickupDialogState | null>(
    null,
  );
  const [relatedPickupDialog, setRelatedPickupDialog] =
    useState<RelatedPickupDialogState | null>(null);
  const [relatedDirectoryPickupDialog, setRelatedDirectoryPickupDialog] =
    useState<RelatedDirectoryPickupDialogState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(
    null,
  );
  const { language, t } = useI18n();

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
          toast.error(t("files.failedLoad"));
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
  }, [fetchFiles, t]);

  const refreshFiles = async () => {
    setIsRefreshing(true);

    try {
      const loadedFiles = await fetchFiles();
      setFiles(loadedFiles);
      setSelectedKeys(new Set());
      setPage(1);
    } catch {
      toast.error(t("files.failedLoad"));
    } finally {
      setIsRefreshing(false);
    }
  };

  const directoryEntries = useMemo(
    () => buildDirectoryEntries(files, currentPath),
    [currentPath, files],
  );

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return directoryEntries;
    }

    return directoryEntries.filter((entry) =>
      getEntrySearchText(entry).includes(normalizedQuery),
    );
  }, [directoryEntries, searchQuery]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }

      const aValue = entrySortValue(a, sort.key);
      const bValue = entrySortValue(b, sort.key);
      const result =
        typeof aValue === "string" && typeof bValue === "string"
          ? aValue.localeCompare(bValue)
          : Number(aValue) - Number(bValue);

      return sort.direction === "asc" ? result : -result;
    });
  }, [filteredEntries, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedEntries = sortedEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const selectedFiles = useMemo(
    () => files.filter((file) => selectedKeys.has(file.key)),
    [files, selectedKeys],
  );
  const currentPageKeys = paginatedEntries.flatMap(getEntrySelectableKeys);
  const allCurrentPageSelected =
    currentPageKeys.length > 0 &&
    currentPageKeys.every((key) => selectedKeys.has(key));
  const partiallySelected =
    currentPageKeys.some((key) => selectedKeys.has(key)) &&
    !allCurrentPageSelected;

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

  const openDirectory = (path: string) => {
    setCurrentPath(path);
    setSearchQuery("");
    setSelectedKeys(new Set());
    setPage(1);
  };

  const openLinkDialog = (file: ManagedFile) => {
    setLinkDialog({
      file,
      expiresInMinutes: String(DEFAULT_EXPIRES_IN_MINUTES),
      isGenerating: false,
    });
  };

  const openDirectoryLinkDialog = (directory: DirectoryEntry) => {
    setDirectoryLinkDialog({
      directory,
      expiresInMinutes: String(DEFAULT_EXPIRES_IN_MINUTES),
      isGenerating: false,
      links: [],
    });
  };

  const openPickupDialogForFiles = (filesForPickup: ManagedFile[]) => {
    if (filesForPickup.length > PICKUP_FILE_LIMIT) {
      toast.error(t("files.pickupFileLimit", { count: PICKUP_FILE_LIMIT }));
      return;
    }

    setPickupDialog({
      files: filesForPickup,
      expiresInMinutes: "10080",
      neverExpires: false,
      isCreating: false,
      pickupCode: null,
    });
  };

  const openPickupDialog = () => {
    openPickupDialogForFiles(selectedFiles);
  };

  const openRelatedPickupCodesDialog = async (file: ManagedFile) => {
    setRelatedPickupDialog({
      file,
      pickupCodes: [],
      isLoading: true,
    });

    try {
      const response = await fetch(
        `/api/pickup-codes/by-file?key=${encodeURIComponent(file.key)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error("Failed to load pickup codes");
      }

      const data = (await response.json()) as {
        pickupCodes: RelatedPickupCode[];
      };
      setRelatedPickupDialog({
        file,
        pickupCodes: data.pickupCodes,
        isLoading: false,
      });
    } catch {
      toast.error(t("files.failedLoadPickupCodes"));
      setRelatedPickupDialog((currentDialog) =>
        currentDialog ? { ...currentDialog, isLoading: false } : null,
      );
    }
  };

  const openRelatedDirectoryPickupCodesDialog = async (directory: DirectoryEntry) => {
    setRelatedDirectoryPickupDialog({
      directory,
      pickupCodes: [],
      isLoading: true,
    });

    try {
      const responses = await Promise.all(
        directory.descendantFiles.map((file) =>
          fetch(`/api/pickup-codes/by-file?key=${encodeURIComponent(file.key)}`, {
            cache: "no-store",
          }),
        ),
      );

      if (responses.some((response) => !response.ok)) {
        throw new Error("Failed to load pickup codes");
      }

      const results = (await Promise.all(
        responses.map((response) => response.json()),
      )) as { pickupCodes: RelatedPickupCode[] }[];
      const pickupCodesById = new Map<string, RelatedPickupCode>();

      for (const result of results) {
        for (const pickupCode of result.pickupCodes) {
          pickupCodesById.set(pickupCode.id, pickupCode);
        }
      }

      setRelatedDirectoryPickupDialog({
        directory,
        pickupCodes: [...pickupCodesById.values()].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
        isLoading: false,
      });
    } catch {
      toast.error(t("files.failedLoadPickupCodes"));
      setRelatedDirectoryPickupDialog((currentDialog) =>
        currentDialog ? { ...currentDialog, isLoading: false } : null,
      );
    }
  };

  const toggleKeysSelection = (keys: string[]) => {
    setSelectedKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      const allSelected = keys.every((key) => nextKeys.has(key));

      if (allSelected) {
        keys.forEach((key) => nextKeys.delete(key));
      } else {
        keys.forEach((key) => nextKeys.add(key));
      }

      return nextKeys;
    });
  };

  const toggleFileSelection = (key: string) => {
    toggleKeysSelection([key]);
  };

  const toggleEntrySelection = (entry: BrowserEntry) => {
    toggleKeysSelection(getEntrySelectableKeys(entry));
  };

  const toggleCurrentPageSelection = () => {
    setSelectedKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (allCurrentPageSelected) {
        currentPageKeys.forEach((key) => nextKeys.delete(key));
      } else {
        currentPageKeys.forEach((key) => nextKeys.add(key));
      }

      return nextKeys;
    });
  };

  const generateDownloadLink = async () => {
    if (!linkDialog) {
      return;
    }

    const expiresInMinutes = Number(linkDialog.expiresInMinutes);
    if (
      !Number.isFinite(expiresInMinutes) ||
      expiresInMinutes < 1 ||
      expiresInMinutes > 10080
    ) {
      toast.error(t("files.validLinkTime"));
      return;
    }

    setLinkDialog({ ...linkDialog, isGenerating: true });

    try {
      const response = await fetch("/api/s3/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: linkDialog.file.key,
          expiresInSeconds: expiresInMinutes * 60,
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
      toast.success(t("files.generatedLink"));
    } catch {
      toast.error(t("files.failedGenerateLink"));
      setLinkDialog((currentDialog) =>
        currentDialog ? { ...currentDialog, isGenerating: false } : null,
      );
    }
  };

  const generateDirectoryDownloadLinks = async () => {
    if (!directoryLinkDialog) {
      return;
    }

    const expiresInMinutes = Number(directoryLinkDialog.expiresInMinutes);
    if (
      !Number.isFinite(expiresInMinutes) ||
      expiresInMinutes < 1 ||
      expiresInMinutes > 10080
    ) {
      toast.error(t("files.validLinkTime"));
      return;
    }

    setDirectoryLinkDialog({ ...directoryLinkDialog, isGenerating: true });

    try {
      const links = await Promise.all(
        directoryLinkDialog.directory.descendantFiles.map(async (file) => {
          const response = await fetch("/api/s3/download", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              key: file.key,
              expiresInSeconds: expiresInMinutes * 60,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to generate link");
          }

          const data = (await response.json()) as { link: DownloadLink };
          return {
            ...data.link,
            key: file.key,
            fileName: file.displayPath,
          };
        }),
      );
      const linksByKey = new Map(links.map((link) => [link.key, link]));

      setFiles((currentFiles) =>
        currentFiles.map((file) => {
          const link = linksByKey.get(file.key);

          return link
            ? {
                ...file,
                presignedUrl: link.url,
                presignedUrlExpiresAt: link.expiresAt,
                presignedUrlCreatedAt: link.createdAt,
              }
            : file;
        }),
      );
      setDirectoryLinkDialog({
        ...directoryLinkDialog,
        isGenerating: false,
        links,
      });
      toast.success(t("files.generatedLinks"));
    } catch {
      toast.error(t("files.failedGenerateLinks"));
      setDirectoryLinkDialog((currentDialog) =>
        currentDialog ? { ...currentDialog, isGenerating: false } : null,
      );
    }
  };

  const createPickupCode = async () => {
    if (!pickupDialog) {
      return;
    }

    const expiresInMinutes = Number(pickupDialog.expiresInMinutes);
    if (
      !pickupDialog.neverExpires &&
      (!Number.isFinite(expiresInMinutes) || expiresInMinutes < 1)
    ) {
      toast.error(t("files.validPickupTime"));
      return;
    }

    setPickupDialog({ ...pickupDialog, isCreating: true });

    try {
      const response = await fetch("/api/pickup-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: pickupDialog.files.map((file) => ({
            key: file.key,
            bucket: file.bucket,
            fileName: file.displayPath,
            size: file.size,
          })),
          expiresInMinutes: pickupDialog.neverExpires
            ? null
            : expiresInMinutes,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create pickup code");
      }

      const data = (await response.json()) as {
        pickupCode: {
          code: string;
          expiresAt: string | null;
        };
      };
      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          selectedKeys.has(file.key)
            ? {
                ...file,
                pickupCodeCount: (file.pickupCodeCount ?? 0) + 1,
              }
            : file,
        ),
      );
      setPickupDialog({
        ...pickupDialog,
        isCreating: false,
        pickupCode: data.pickupCode,
      });
      toast.success(t("files.createdPickupCode"));
    } catch {
      toast.error(t("files.failedCreatePickupCode"));
      setPickupDialog((currentDialog) =>
        currentDialog ? { ...currentDialog, isCreating: false } : null,
      );
    }
  };

  const deleteFiles = async () => {
    if (!deleteDialog) {
      return;
    }

    setDeleteDialog({ ...deleteDialog, isDeleting: true });

    try {
      const responses = await Promise.all(
        deleteDialog.files.map((file) =>
          fetch("/api/s3/delete", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: file.key }),
          }),
        ),
      );

      if (responses.some((response) => !response.ok)) {
        throw new Error("Failed to delete files");
      }

      const deletedKeys = new Set(deleteDialog.files.map((file) => file.key));
      setFiles((currentFiles) =>
        currentFiles.filter((file) => !deletedKeys.has(file.key)),
      );
      setSelectedKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys);
        deletedKeys.forEach((key) => nextKeys.delete(key));
        return nextKeys;
      });
      setPage((current) =>
        Math.min(
          current,
          Math.max(
            1,
            Math.ceil((sortedEntries.length - deletedKeys.size) / PAGE_SIZE),
          ),
        ),
      );
      setDeleteDialog(null);
      toast.success(
        deleteDialog.files.length === 1
          ? t("files.deleted")
          : t("files.deletedPlural"),
      );
    } catch {
      toast.error(t("files.failedDelete"));
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
              <p className="text-sm font-medium">{t("files.cardTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("files.countSummary", {
                  filtered: filteredEntries.length,
                  total: files.length,
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedFiles.length > 0 && (
                <>
                  <Button onClick={openPickupDialog}>
                    <KeyRound className="size-4" />
                    {t("files.createPickupCode")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      setDeleteDialog({
                        files: selectedFiles,
                        isDeleting: false,
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                    {t("files.deleteSelected")}
                  </Button>
                </>
              )}
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
                {t("common.refresh")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 border-b px-4 py-2 text-sm">
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

          <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSelectedKeys(new Set());
                  setPage(1);
                }}
                placeholder={t("files.searchPlaceholder")}
                className="h-9 w-full rounded-lg border bg-background pr-9 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedKeys(new Set());
                    setPage(1);
                  }}
                  aria-label={t("files.clearSearch")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            {selectedFiles.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("files.selected", { count: selectedFiles.length })}
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-245 table-fixed text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="w-12 px-4 py-3 font-medium">
                    <input
                      type="checkbox"
                      checked={allCurrentPageSelected}
                      aria-checked={
                        partiallySelected ? "mixed" : allCurrentPageSelected
                      }
                      onChange={toggleCurrentPageSelection}
                      aria-label={t("files.selectCurrentPage")}
                      className="size-4 rounded border-border accent-primary"
                    />
                  </th>
                  <th className="w-44 px-4 py-3 font-medium">
                    {t("files.bucket")}
                  </th>
                  <th className="w-72 px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1.5"
                      onClick={() => changeSort("fileName")}
                    >
                      {t("files.fileName")}
                      {renderSortIcon("fileName")}
                    </button>
                  </th>
                  <th className="w-28 px-4 py-3 font-medium">
                    {t("files.size")}
                  </th>
                  <th className="w-44 px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1.5"
                      onClick={() => changeSort("lastModified")}
                    >
                      {t("files.uploaded")}
                      {renderSortIcon("lastModified")}
                    </button>
                  </th>
                  <th className="w-52 px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="flex items-center gap-1.5"
                      onClick={() => changeSort("presignedUrlExpiresAt")}
                    >
                      {t("files.linkExpires")}
                      {renderSortIcon("presignedUrlExpiresAt")}
                    </button>
                  </th>
                  <th className="w-20 px-4 py-3 text-right font-medium">
                    {t("files.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        {t("files.loading")}
                      </div>
                    </td>
                  </tr>
                ) : paginatedEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      {t("files.empty")}
                    </td>
                  </tr>
                ) : (
                  paginatedEntries.map((entry) => {
                    if (entry.type === "directory") {
                      const selectableKeys = getEntrySelectableKeys(entry);
                      const allSelected =
                        selectableKeys.length > 0 &&
                        selectableKeys.every((key) => selectedKeys.has(key));
                      const someSelected =
                        selectableKeys.some((key) => selectedKeys.has(key)) &&
                        !allSelected;

                      return (
                        <tr
                          key={entry.id}
                          className="border-b bg-muted/20 last:border-b-0"
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              aria-checked={someSelected ? "mixed" : allSelected}
                              onChange={() => toggleEntrySelection(entry)}
                              aria-label={t("files.selectFolder", {
                                folderName: entry.name,
                              })}
                              className="size-4 rounded border-border accent-primary"
                            />
                          </td>
                          <td className="truncate px-4 py-3 text-muted-foreground">
                            {files[0]?.bucket ?? "-"}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="flex max-w-full items-center gap-2 font-medium hover:underline"
                              onClick={() => openDirectory(entry.path)}
                            >
                              <Folder className="size-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{entry.name}</span>
                            </button>
                            <div className="truncate text-xs text-muted-foreground">
                              {t("files.folderSummary", {
                                count: entry.fileCount,
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {formatBytes(entry.totalSize)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(entry.lastModified, language)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">-</td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="size-4" />
                                  <span className="sr-only">
                                    {t("files.openMenu")}
                                  </span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onSelect={() => openDirectoryLinkDialog(entry)}
                                >
                                  <Download className="size-4" />
                                  {t("files.downloadLink")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    openPickupDialogForFiles(
                                      entry.descendantFiles,
                                    )
                                  }
                                >
                                  <KeyRound className="size-4" />
                                  {t("files.createPickupCode")}
                                </DropdownMenuItem>
                                {entry.descendantFiles.some(
                                  (file) => (file.pickupCodeCount ?? 0) > 0,
                                ) && (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      void openRelatedDirectoryPickupCodesDialog(
                                        entry,
                                      )
                                    }
                                  >
                                    <KeyRound className="size-4" />
                                    {t("files.viewPickupCodes")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() =>
                                    setDeleteDialog({
                                      files: entry.descendantFiles,
                                      isDeleting: false,
                                    })
                                  }
                                >
                                  <Trash2 className="size-4" />
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    }

                    const file = entry.file;
                    const expired = isExpired(file.presignedUrlExpiresAt);

                    return (
                      <tr key={file.key} className="border-b last:border-b-0">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(file.key)}
                            onChange={() => toggleFileSelection(file.key)}
                            aria-label={t("files.selectFile", {
                              fileName: file.fileName,
                            })}
                            className="size-4 rounded border-border accent-primary"
                          />
                        </td>
                        <td className="truncate px-4 py-3 text-muted-foreground">
                          {file.bucket}
                        </td>
                        <td className="px-4 py-3">
                          <div className="truncate font-medium">
                            {file.fileName}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {file.displayPath}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {file.key}
                          </div>
                          {(file.pickupCodeCount ?? 0) > 0 && (
                            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              <KeyRound className="size-3" />
                              {t("files.sharedBy", {
                                count: file.pickupCodeCount ?? 0,
                                plural:
                                  (file.pickupCodeCount ?? 0) === 1 ? "" : "s",
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {formatBytes(file.size)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(file.lastModified, language)}
                        </td>
                        <td className="px-4 py-3">
                          {file.presignedUrlExpiresAt ? (
                            <div
                              className={cn(
                                "text-muted-foreground",
                                expired && "text-destructive",
                              )}
                            >
                              <div>
                                {formatDate(
                                  file.presignedUrlExpiresAt,
                                  language,
                                )}
                              </div>
                              {expired && (
                                <div className="text-xs">
                                  {t("common.expired")}
                                </div>
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
                                <span className="sr-only">
                                  {t("files.openMenu")}
                                </span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onSelect={() => openLinkDialog(file)}
                              >
                                <Download className="size-4" />
                                {t("files.downloadLink")}
                              </DropdownMenuItem>
                              {(file.pickupCodeCount ?? 0) > 0 && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void openRelatedPickupCodesDialog(file)
                                  }
                                >
                                  <KeyRound className="size-4" />
                                  {t("files.viewPickupCodes")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() =>
                                  setDeleteDialog({
                                    files: [file],
                                    isDeleting: false,
                                  })
                                }
                              >
                                <Trash2 className="size-4" />
                                {t("common.delete")}
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
              {t("files.pageSummary", {
                current: currentPage,
                total: totalPages,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={currentPage === 1}
              >
                {t("files.previous")}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={currentPage === totalPages}
              >
                {t("files.next")}
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
              {t("files.downloadLink")}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {t("files.downloadDescription")}
            </Dialog.Description>

            {linkDialog && (
              <div className="mt-5 flex flex-col gap-4">
                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="truncate text-sm font-medium">
                    {linkDialog.file.displayPath}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {linkDialog.file.key}
                  </p>
                </div>

                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t("files.validForMinutes")}
                  <div className="mb-1 flex flex-wrap gap-2">
                    {EXPIRY_PRESETS.map((preset) => (
                      <Button
                        key={preset.minutes}
                        type="button"
                        variant={
                          linkDialog.expiresInMinutes === preset.minutes
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setLinkDialog({
                            ...linkDialog,
                            expiresInMinutes: preset.minutes,
                          })
                        }
                      >
                        {t(preset.labelKey)}
                      </Button>
                    ))}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={linkDialog.expiresInMinutes}
                    onChange={(event) =>
                      setLinkDialog({
                        ...linkDialog,
                        expiresInMinutes: event.target.value.replace(/\D/g, ""),
                      })
                    }
                    placeholder="60"
                    className="h-9 rounded-lg border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </label>

                {linkDialog.file.presignedUrl && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        {t("files.existingLink")}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void copyToClipboard(
                            linkDialog.file.presignedUrl as string,
                            t("files.linkCopied"),
                            t("files.failedCopyLink"),
                          )
                        }
                      >
                        <Copy className="size-4" />
                        {t("common.copy")}
                      </Button>
                    </div>
                    <textarea
                      readOnly
                      value={linkDialog.file.presignedUrl}
                      className="min-h-24 resize-none rounded-lg border bg-background p-3 text-xs outline-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("files.expires", {
                        date: formatDate(
                          linkDialog.file.presignedUrlExpiresAt,
                          language,
                        ),
                      })}
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">{t("common.close")}</Button>
                  </Dialog.Close>
                  <Button
                    onClick={() => void generateDownloadLink()}
                    disabled={
                      linkDialog.isGenerating ||
                      !Number.isFinite(Number(linkDialog.expiresInMinutes)) ||
                      Number(linkDialog.expiresInMinutes) < 1 ||
                      Number(linkDialog.expiresInMinutes) > 10080
                    }
                  >
                    {linkDialog.isGenerating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    {t("files.generateNewLink")}
                  </Button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(directoryLinkDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setDirectoryLinkDialog(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-lg">
            <div className="border-b p-5">
              <Dialog.Title className="text-lg font-semibold">
                {t("files.downloadLinks")}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {t("files.downloadLinksDescription")}
              </Dialog.Description>
            </div>

            {directoryLinkDialog && (
              <>
                <div className="border-b p-4">
                  <div className="rounded-md bg-muted px-3 py-2">
                    <p className="truncate text-sm font-medium">
                      {directoryLinkDialog.directory.path}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("files.folderSummary", {
                        count: directoryLinkDialog.directory.fileCount,
                      })}
                    </p>
                  </div>
                  <label className="mt-4 flex flex-col gap-1 text-sm font-medium">
                    {t("files.validForMinutes")}
                    <div className="mb-1 flex flex-wrap gap-2">
                      {EXPIRY_PRESETS.map((preset) => (
                        <Button
                          key={preset.minutes}
                          type="button"
                          variant={
                            directoryLinkDialog.expiresInMinutes ===
                            preset.minutes
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() =>
                            setDirectoryLinkDialog({
                              ...directoryLinkDialog,
                              expiresInMinutes: preset.minutes,
                            })
                          }
                        >
                          {t(preset.labelKey)}
                        </Button>
                      ))}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={directoryLinkDialog.expiresInMinutes}
                      onChange={(event) =>
                        setDirectoryLinkDialog({
                          ...directoryLinkDialog,
                          expiresInMinutes: event.target.value.replace(
                            /\D/g,
                            "",
                          ),
                        })
                      }
                      placeholder="60"
                      className="h-9 rounded-lg border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </label>
                </div>

                <div className="min-h-32 flex-1 overflow-y-auto">
                  {directoryLinkDialog.links.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {t("files.downloadLinksDescription")}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {directoryLinkDialog.links.map((link) => (
                        <div key={link.key} className="px-4 py-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-medium">
                              {link.fileName}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void copyToClipboard(
                                  link.url,
                                  t("files.linkCopied"),
                                  t("files.failedCopyLink"),
                                )
                              }
                            >
                              <Copy className="size-4" />
                              {t("common.copy")}
                            </Button>
                          </div>
                          <textarea
                            readOnly
                            value={link.url}
                            className="min-h-20 w-full resize-none rounded-lg border bg-background p-3 text-xs outline-none"
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("files.expires", {
                              date: formatDate(link.expiresAt, language),
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 border-t p-4">
                  <Dialog.Close asChild>
                    <Button variant="outline">{t("common.close")}</Button>
                  </Dialog.Close>
                  <Button
                    onClick={() => void generateDirectoryDownloadLinks()}
                    disabled={
                      directoryLinkDialog.isGenerating ||
                      !Number.isFinite(
                        Number(directoryLinkDialog.expiresInMinutes),
                      ) ||
                      Number(directoryLinkDialog.expiresInMinutes) < 1 ||
                      Number(directoryLinkDialog.expiresInMinutes) > 10080
                    }
                  >
                    {directoryLinkDialog.isGenerating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    {t("files.generateNewLink")}
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(pickupDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setPickupDialog(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg">
            <Dialog.Title className="text-lg font-semibold">
              {t("files.pickupCode")}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {t("files.pickupDescription")}
            </Dialog.Description>

            {pickupDialog && (
              <div className="mt-5 flex flex-col gap-4">
                <div className="max-h-36 overflow-y-auto rounded-md bg-muted px-3 py-2 text-sm">
                  {pickupDialog.files.map((file) => (
                    <p key={file.key} className="truncate">
                      {file.displayPath}
                    </p>
                  ))}
                </div>

                {!pickupDialog.pickupCode ? (
                  <>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      {t("files.validForMinutes")}
                      <div className="mb-1 flex flex-wrap gap-2">
                        {PICKUP_EXPIRY_PRESETS.map((preset) => (
                          <Button
                            key={preset.minutes}
                            type="button"
                            variant={
                              !pickupDialog.neverExpires &&
                              pickupDialog.expiresInMinutes === preset.minutes
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() =>
                              setPickupDialog({
                                ...pickupDialog,
                                neverExpires: false,
                                expiresInMinutes: preset.minutes,
                              })
                            }
                          >
                            {t(preset.labelKey)}
                          </Button>
                        ))}
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={pickupDialog.expiresInMinutes}
                        onChange={(event) =>
                          setPickupDialog({
                            ...pickupDialog,
                            neverExpires: false,
                            expiresInMinutes: event.target.value.replace(
                              /\D/g,
                              "",
                            ),
                          })
                        }
                        disabled={pickupDialog.neverExpires}
                        placeholder="10080"
                        className="h-9 rounded-lg border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                      />
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={pickupDialog.neverExpires}
                        onChange={(event) =>
                          setPickupDialog({
                            ...pickupDialog,
                            neverExpires: event.target.checked,
                          })
                        }
                        className="size-4 rounded border-border accent-primary"
                      />
                      {t("files.neverExpire")}
                    </label>
                  </>
                ) : (
                  <div className="flex flex-col gap-3 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {t("files.generatedCode")}
                      </p>
                      <p className="mt-1 font-mono text-3xl font-semibold tracking-normal">
                        {pickupDialog.pickupCode.code}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {pickupDialog.pickupCode.expiresAt
                          ? t("files.expires", {
                              date: formatDate(
                                pickupDialog.pickupCode.expiresAt,
                                language,
                              ),
                            })
                          : t("common.neverExpires")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          void copyToClipboard(
                            pickupDialog.pickupCode!.code,
                            t("files.linkCopied"),
                            t("detail.failedCopy"),
                          )
                        }
                      >
                        <Copy className="size-4" />
                        {t("files.copyCode")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          void copyToClipboard(
                            `${window.location.origin}/pickup?code=${encodeURIComponent(
                              pickupDialog.pickupCode!.code,
                            )}`,
                            t("pickup.linkCopied"),
                            t("detail.failedCopy"),
                          )
                        }
                      >
                        <Copy className="size-4" />
                        {t("files.copyPickupLink")}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button variant="outline">{t("common.close")}</Button>
                  </Dialog.Close>
                  {!pickupDialog.pickupCode && (
                    <Button
                      onClick={() => void createPickupCode()}
                      disabled={
                        pickupDialog.isCreating ||
                        (!pickupDialog.neverExpires &&
                          (!Number.isFinite(
                            Number(pickupDialog.expiresInMinutes),
                          ) ||
                            Number(pickupDialog.expiresInMinutes) < 1))
                      }
                    >
                      {pickupDialog.isCreating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <KeyRound className="size-4" />
                      )}
                      {t("files.createCode")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(relatedPickupDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setRelatedPickupDialog(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-lg">
            <div className="border-b p-5">
              <Dialog.Title className="text-lg font-semibold">
                {t("files.relatedTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {t("files.relatedDescription")}
              </Dialog.Description>
              {relatedPickupDialog && (
                <div className="mt-3 rounded-md bg-muted px-3 py-2">
                  <p className="truncate text-sm font-medium">
                    {relatedPickupDialog.file.displayPath}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {relatedPickupDialog.file.key}
                  </p>
                </div>
              )}
            </div>

            <div className="min-h-48 flex-1 overflow-y-auto">
              {relatedPickupDialog?.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-12 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("files.relatedLoading")}
                </div>
              ) : relatedPickupDialog?.pickupCodes.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {t("files.relatedEmpty")}
                </div>
              ) : (
                <div className="divide-y">
                  {relatedPickupDialog?.pickupCodes.map((pickupCode) => {
                    const status = getPickupCodeStatus(pickupCode);
                    const StatusIcon = status.icon;

                    return (
                      <div
                        key={pickupCode.id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-sm font-semibold">
                              {pickupCode.code}
                            </p>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-xs",
                                status.className,
                              )}
                            >
                              <StatusIcon className="size-3.5" />
                              {t(status.labelKey)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {countLabel(
                              language,
                              pickupCode.fileCount,
                              "file",
                              "files",
                              "个文件",
                            )}{" "}
                            · {t("pickup.expires").toLocaleLowerCase()}{" "}
                            {pickupCode.expiresAt
                              ? formatDate(pickupCode.expiresAt, language)
                              : t("common.never")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
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
                            {t("files.copyPickupLink")}
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/pickup-codes/${pickupCode.id}`}>
                              <ExternalLink className="size-4" />
                              {t("files.openPickupDetail")}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t p-4">
              <Dialog.Close asChild>
                <Button variant="outline">{t("common.close")}</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(relatedDirectoryPickupDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setRelatedDirectoryPickupDialog(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-lg">
            <div className="border-b p-5">
              <Dialog.Title className="text-lg font-semibold">
                {t("files.relatedTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {t("files.relatedDescription")}
              </Dialog.Description>
              {relatedDirectoryPickupDialog && (
                <div className="mt-3 rounded-md bg-muted px-3 py-2">
                  <p className="truncate text-sm font-medium">
                    {relatedDirectoryPickupDialog.directory.path}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("files.folderSummary", {
                      count: relatedDirectoryPickupDialog.directory.fileCount,
                    })}
                  </p>
                </div>
              )}
            </div>

            <div className="min-h-48 flex-1 overflow-y-auto">
              {relatedDirectoryPickupDialog?.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-12 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("files.relatedLoading")}
                </div>
              ) : relatedDirectoryPickupDialog?.pickupCodes.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {t("files.relatedEmpty")}
                </div>
              ) : (
                <div className="divide-y">
                  {relatedDirectoryPickupDialog?.pickupCodes.map((pickupCode) => {
                    const status = getPickupCodeStatus(pickupCode);
                    const StatusIcon = status.icon;

                    return (
                      <div
                        key={pickupCode.id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-sm font-semibold">
                              {pickupCode.code}
                            </p>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-xs",
                                status.className,
                              )}
                            >
                              <StatusIcon className="size-3.5" />
                              {t(status.labelKey)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {countLabel(
                              language,
                              pickupCode.fileCount,
                              "file",
                              "files",
                              "个文件",
                            )}{" "}
                            · {t("pickup.expires").toLocaleLowerCase()}{" "}
                            {pickupCode.expiresAt
                              ? formatDate(pickupCode.expiresAt, language)
                              : t("common.never")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
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
                            {t("files.copyPickupLink")}
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/pickup-codes/${pickupCode.id}`}>
                              <ExternalLink className="size-4" />
                              {t("files.openPickupDetail")}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t p-4">
              <Dialog.Close asChild>
                <Button variant="outline">{t("common.close")}</Button>
              </Dialog.Close>
            </div>
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
              {deleteDialog?.files.length === 1
                ? t("files.deleteSingleTitle")
                : t("files.deleteTitle")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteDialog?.files.length === 1
                ? t("files.deleteSingleDescription")
                : t("files.deleteDescription")}
            </AlertDialog.Description>

            {deleteDialog && (
              <>
                {deleteDialog.files.some(
                  (file) => (file.pickupCodeCount ?? 0) > 0,
                ) && (
                  <div className="mt-3 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>
                      {t("files.deletePickupWarning")}
                    </p>
                  </div>
                )}
                <div className="mt-3 max-h-40 overflow-y-auto rounded-md bg-muted px-3 py-2 text-sm">
                  {deleteDialog.files.map((file) => (
                    <p key={file.key} className="truncate">
                      {file.displayPath}
                      {(file.pickupCodeCount ?? 0) > 0
                        ? ` (${countLabel(
                            language,
                            file.pickupCodeCount ?? 0,
                            "pickup code",
                            "pickup codes",
                            "个取件码",
                          )})`
                        : ""}
                    </p>
                  ))}
                </div>
              </>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline" disabled={deleteDialog?.isDeleting}>
                  {t("common.keep")}
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  onClick={(event) => {
                    event.preventDefault();
                    void deleteFiles();
                  }}
                  disabled={deleteDialog?.isDeleting}
                >
                  {deleteDialog?.isDeleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {t("common.delete")}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
