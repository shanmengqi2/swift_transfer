/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { useDropzone } from "react-dropzone";
import { AlertDialog } from "radix-ui";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import type { FileRejection } from "react-dropzone";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { FileIcon, FolderUp, Loader2, Trash2, X } from "lucide-react";
import type { UploadLimits } from "@/lib/uploadLimits";
import { useI18n } from "@/components/i18n-provider";

const FILE_PLACEHOLDER_SRC = "/File.png";

function displayUploadFileName(fileName: string) {
  return fileName.replace(/\.app\.zip$/i, ".app");
}

type UploadFile = {
  id: string;
  file: File;
  relativePath?: string;
  uploading: boolean;
  progress: number;
  key?: string;
  isDeleting: boolean;
  isCancelling: boolean;
  error: boolean;
  objectUrl?: string;
  isImage: boolean;
};

type FileWithPath = File & {
  path?: string;
  relativePath?: string;
  webkitRelativePath?: string;
};

type UploadJob = {
  xhr?: XMLHttpRequest;
  presignController?: AbortController;
  key?: string;
  abortRequested: boolean;
};

type Confirmation =
  | { type: "delete"; fileId: string }
  | { type: "cancel"; fileId: string };

type UploaderProps = {
  limits: UploadLimits;
};

function getRejectionErrorCodes(fileRejections: FileRejection[]) {
  return new Set(
    fileRejections.flatMap((fileRejection) =>
      fileRejection.errors.map((error) => error.code),
    ),
  );
}

export function Uploader({ limits }: UploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const uploadJobsRef = useRef(new Map<string, UploadJob>());
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { maxFiles, maxFileSizeMb, maxFileSizeBytes } = limits;
  const { t } = useI18n();

  const revokeObjectUrl = (file?: UploadFile) => {
    if (file?.objectUrl) {
      URL.revokeObjectURL(file.objectUrl);
    }
  };

  const cleanupS3Object = useCallback(async (key?: string) => {
    if (!key) {
      return true;
    }

    const deleteFileResponse = await fetch("/api/s3/delete", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });

    return deleteFileResponse.ok;
  }, []);

  const removeFile = async (fileId: string) => {
    try {
      const fileToRemove = files.find((f) => f.id === fileId);
      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.id === fileId ? { ...f, isDeleting: true } : f,
        ),
      );

      const deleted = await cleanupS3Object(fileToRemove?.key);
      if (!deleted) {
        toast.error(t("upload.failedDelete"));
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.id === fileId ? { ...f, isDeleting: false, error: true } : f,
          ),
        );

        return;
      }

      revokeObjectUrl(fileToRemove);
      toast.success(t("upload.deleted"));
      setFiles((prevFiles) => prevFiles.filter((f) => f.id !== fileId));
    } catch {
      toast.error(t("upload.failedDelete"));
      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.id === fileId ? { ...f, isDeleting: false, error: true } : f,
        ),
      );
    }
  };

  const cancelUpload = useCallback((fileId: string) => {
    const job = uploadJobsRef.current.get(fileId);
    if (job) {
      job.abortRequested = true;
      job.presignController?.abort();
      job.xhr?.abort();
    }

    setFiles((prevFiles) =>
      prevFiles.map((f) =>
        f.id === fileId ? { ...f, isCancelling: true, uploading: false } : f,
      ),
    );
  }, []);

  const uploadFile = useCallback(
    async (upload: UploadFile, batchFileCount: number) => {
      const { id: fileId, file } = upload;
      const presignController = new AbortController();
      const job: UploadJob = { presignController, abortRequested: false };
      uploadJobsRef.current.set(fileId, job);

      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.id === fileId
            ? { ...f, uploading: true, progress: 0, error: false }
            : f,
        ),
      );

      try {
        const presignedUrlResponse = await fetch("/api/s3/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: presignController.signal,
          body: JSON.stringify({
            fileName: file.name,
            relativePath: upload.relativePath,
            contentType: file.type || "application/octet-stream",
            size: file.size,
            batchFileCount,
          }),
        });

        if (job.abortRequested) {
          throw new DOMException("Upload aborted", "AbortError");
        }

        if (!presignedUrlResponse.ok) {
          toast.error(t("upload.failedPresign"));
          setFiles((prevFiles) =>
            prevFiles.map((f) =>
              f.id === fileId
                ? { ...f, uploading: false, progress: 0, error: true }
                : f,
            ),
          );
          return;
        }

        const { presignedUrl, uniqueKey } = await presignedUrlResponse.json();
        job.key = uniqueKey;

        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.id === fileId
              ? { ...f, key: uniqueKey, progress: 0 }
              : f,
          ),
        );

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          job.xhr = xhr;

          xhr.upload.onprogress = (event) => {
            const totalBytes =
              event.lengthComputable && event.total > 0
                ? event.total
                : file.size;
            if (!totalBytes) {
              return;
            }

            const percentageCompleted = Math.floor(
              (event.loaded / totalBytes) * 100,
            );
            const displayProgress = Math.min(99, percentageCompleted);

            setFiles((prevFiles) =>
              prevFiles.map((f) =>
                f.id === fileId
                  ? { ...f, progress: Math.max(f.progress, displayProgress) }
                  : f,
              ),
            );
          };
          xhr.onload = () => {
            if (xhr.status === 200 || xhr.status === 204) {
              setFiles((prevFiles) =>
                prevFiles.map((f) =>
                  f.id === fileId
                    ? { ...f, progress: 100, uploading: false, error: false }
                    : f,
                ),
              );

              toast.success(t("upload.uploaded"));
              resolve();
            } else {
              reject(new Error(`Upload failed with status: ${xhr.status}`));
            }
          };
          xhr.onerror = () => {
            reject(new Error("Upload failed"));
          };
          xhr.onabort = () => {
            reject(new DOMException("Upload aborted", "AbortError"));
          };

          xhr.open("PUT", presignedUrl);
          xhr.setRequestHeader(
            "Content-Type",
            file.type || "application/octet-stream",
          );
          xhr.send(file);
        });
      } catch (error) {
        if (
          job.abortRequested ||
          (error as DOMException).name === "AbortError"
        ) {
          const cleaned = await cleanupS3Object(job.key);
          revokeObjectUrl(upload);
          uploadJobsRef.current.delete(fileId);
          setFiles((prevFiles) => prevFiles.filter((f) => f.id !== fileId));

          if (cleaned) {
            toast.success(t("upload.cancelled"));
          } else {
            toast.error(t("upload.cancelledCleanupFailed"));
          }
          return;
        }

        toast.error(t("upload.failed"));
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.id === fileId
              ? { ...f, uploading: false, progress: 0, error: true }
              : f,
          ),
        );
      } finally {
        if (!job.abortRequested) {
          uploadJobsRef.current.delete(fileId);
        }
      }
    },
    [cleanupS3Object, t],
  );

  const getRelativePath = (file: File) => {
    const fileWithPath = file as FileWithPath;
    const rawPath =
      fileWithPath.relativePath ||
      fileWithPath.webkitRelativePath ||
      fileWithPath.path;

    if (!rawPath) {
      return undefined;
    }

    const normalizedPath = rawPath
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/^\/+/, "");
    return normalizedPath.includes("/") ? normalizedPath : undefined;
  };

  const queueUploads = useCallback(
    (acceptedFiles: File[], batchFileCount: number) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      const uploads: UploadFile[] = acceptedFiles.map((file) => {
        const isImage = file.type.startsWith("image/");

        return {
          id: uuidv4(),
          file,
          relativePath: getRelativePath(file),
          uploading: false,
          progress: 0,
          isDeleting: false,
          isCancelling: false,
          error: false,
          isImage,
          objectUrl: isImage ? URL.createObjectURL(file) : undefined,
        };
      });

      setFiles((prevFiles) => [...prevFiles, ...uploads]);
      uploads.forEach((upload) => uploadFile(upload, batchFileCount));
    },
    [uploadFile],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      const droppedFileCount = acceptedFiles.length + fileRejections.length;
      const errorCodes = getRejectionErrorCodes(fileRejections);

      if (droppedFileCount > maxFiles || errorCodes.has("too-many-files")) {
        toast.error(t("upload.maxFiles", { maxFiles }));
      }

      if (errorCodes.has("file-too-large")) {
        toast.error(t("upload.maxSize", { maxFileSizeMb }));
      }

      queueUploads(acceptedFiles, droppedFileCount);
    },
    [maxFileSizeMb, maxFiles, queueUploads, t],
  );

  const onFolderSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selectedFiles.length > maxFiles) {
      toast.error(t("upload.maxFiles", { maxFiles }));
      return;
    }

    const acceptedFiles = selectedFiles.filter(
      (file) => file.size <= maxFileSizeBytes,
    );

    if (acceptedFiles.length < selectedFiles.length) {
      toast.error(t("upload.maxSize", { maxFileSizeMb }));
    }

    queueUploads(acceptedFiles, selectedFiles.length);
  };

  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    console.log("rejected:", fileRejections);
  }, []);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected,
    maxFiles,
    maxSize: maxFileSizeBytes,
    noClick: true,
  });

  const confirmationFile = confirmation
    ? files.find((file) => file.id === confirmation.fileId)
    : undefined;
  const isCancelConfirmation = confirmation?.type === "cancel";

  return (
    <>
      {/*<p>
        {maxFiles}, {maxFileSizeMb}
      </p>*/}
      <Card
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed transition-colors duration-200 ease-in-out w-full h-64",
          isDragActive
            ? "border-primary bg-primary/10 border-solid"
            : "border-border hover:border-primary",
        )}
      >
        <CardContent className="flex flex-col items-center justify-center h-full w-full">
          <input {...getInputProps()} />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            aria-label={t("upload.selectFolder")}
            onChange={onFolderSelected}
            {...{ webkitdirectory: "", directory: "" }}
          />
          {isDragActive ? (
            <p className="text-center">{t("upload.dropHere")}</p>
          ) : (
            <div className="flex flex-col items-center justify-center h-full w-full gap-y-3">
              <p>{t("upload.prompt")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    open();
                  }}
                >
                  {t("upload.selectFiles")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    folderInputRef.current?.click();
                  }}
                >
                  <FolderUp className="size-4" />
                  {t("upload.selectFolder")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 mt-6 mb-24">
        {files.map((file) => (
          <div key={file.id} className="flex flex-col gap-1">
            <div className="relative aspect-square rounded-lg overflow-hidden">
              <img
                src={file.isImage ? file.objectUrl : FILE_PLACEHOLDER_SRC}
                alt={file.file.name}
                className={cn(
                  "w-full h-full",
                  file.isImage ? "object-cover" : "object-contain bg-muted p-8",
                )}
              />
              <Button
                variant={file.uploading ? "secondary" : "destructive"}
                size="icon"
                className="absolute top-2 right-2 z-20"
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmation({
                    type: file.uploading ? "cancel" : "delete",
                    fileId: file.id,
                  });
                }}
                disabled={file.isDeleting || file.isCancelling}
                aria-label={
                  file.uploading
                    ? t("upload.cancelUpload")
                    : t("upload.deleteFile")
                }
              >
                {file.isDeleting || file.isCancelling ? (
                  <Loader2 className="animate-spin" />
                ) : file.uploading ? (
                  <X className="size-4" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
              {file.uploading && !file.isDeleting && (
                <div className="pointer-events-none absolute inset-0 z-10 bg-black/55 flex flex-col items-center justify-center gap-3 px-5">
                  <p className="text-white font-medium text-lg tabular-nums">
                    {file.progress}%
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/30">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-200"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {file.error && (
                <div className="pointer-events-none absolute inset-0 z-10 bg-red-500/50 flex items-center justify-center">
                  <p className="text-white font-medium text-lg">
                    {t("common.error")}
                  </p>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground truncate">
              {displayUploadFileName(file.relativePath ?? file.file.name)}
            </p>
            {!file.isImage && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileIcon className="size-3" />
                <span className="truncate">
                  {file.file.type || t("common.unknownFileType")}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <AlertDialog.Root
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-lg">
            <AlertDialog.Title className="text-lg font-semibold">
              {isCancelConfirmation
                ? t("upload.cancelTitle")
                : t("upload.deleteTitle")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              {isCancelConfirmation
                ? t("upload.cancelDescription")
                : t("upload.deleteDescription")}
            </AlertDialog.Description>

            {confirmationFile && (
              <p className="mt-3 truncate rounded-md bg-muted px-3 py-2 text-sm">
                {confirmationFile.file.name}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">{t("common.keep")}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const currentConfirmation = confirmation;
                    setConfirmation(null);

                    if (!currentConfirmation) {
                      return;
                    }

                    if (currentConfirmation.type === "cancel") {
                      cancelUpload(currentConfirmation.fileId);
                      return;
                    }

                    void removeFile(currentConfirmation.fileId);
                  }}
                >
                  {isCancelConfirmation
                    ? t("upload.cancelUpload")
                    : t("common.delete")}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
