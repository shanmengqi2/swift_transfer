/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AlertDialog } from "radix-ui";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import type { FileRejection } from "react-dropzone";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { FileIcon, Loader2, Trash2, X } from "lucide-react";

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE = 1024 * 1024 * MAX_FILE_SIZE_MB;
const FILE_PLACEHOLDER_SRC = "/File.png";

type UploadFile = {
  id: string;
  file: File;
  uploading: boolean;
  progress: number;
  key?: string;
  isDeleting: boolean;
  isCancelling: boolean;
  error: boolean;
  objectUrl?: string;
  isImage: boolean;
};

type UploadJob = {
  xhr?: XMLHttpRequest;
  presignController?: AbortController;
  key?: string;
  progressTimer?: number;
  abortRequested: boolean;
};

type Confirmation =
  | { type: "delete"; fileId: string }
  | { type: "cancel"; fileId: string };

function getRejectionErrorCodes(fileRejections: FileRejection[]) {
  return new Set(
    fileRejections.flatMap((fileRejection) =>
      fileRejection.errors.map((error) => error.code),
    ),
  );
}

export function Uploader() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const uploadJobsRef = useRef(new Map<string, UploadJob>());

  const clearProgressTimer = (job?: UploadJob) => {
    if (job?.progressTimer) {
      window.clearInterval(job.progressTimer);
      job.progressTimer = undefined;
    }
  };

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
        toast.error("Failed to delete file");
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.id === fileId ? { ...f, isDeleting: false, error: true } : f,
          ),
        );

        return;
      }

      revokeObjectUrl(fileToRemove);
      toast.success("File deleted successfully");
      setFiles((prevFiles) => prevFiles.filter((f) => f.id !== fileId));
    } catch {
      toast.error("Failed to delete file");
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
      clearProgressTimer(job);
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
    async (upload: UploadFile) => {
      const { id: fileId, file } = upload;
      const presignController = new AbortController();
      const job: UploadJob = { presignController, abortRequested: false };
      uploadJobsRef.current.set(fileId, job);

      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.id === fileId
            ? { ...f, uploading: true, progress: 1, error: false }
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
            contentType: file.type || "application/octet-stream",
            size: file.size,
          }),
        });

        if (job.abortRequested) {
          throw new DOMException("Upload aborted", "AbortError");
        }

        if (!presignedUrlResponse.ok) {
          toast.error("failed to get Presigned Url");
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
              ? { ...f, key: uniqueKey, progress: Math.max(f.progress, 5) }
              : f,
          ),
        );

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          job.xhr = xhr;
          job.progressTimer = window.setInterval(() => {
            setFiles((prevFiles) =>
              prevFiles.map((f) =>
                f.id === fileId && f.uploading && !f.isCancelling
                  ? { ...f, progress: Math.min(f.progress + 1, 92) }
                  : f,
              ),
            );
          }, 350);

          xhr.upload.onprogress = (event) => {
            const totalBytes = event.lengthComputable ? event.total : file.size;
            if (!totalBytes) {
              return;
            }

            const percentageCompleted = Math.round(
              (event.loaded / totalBytes) * 100,
            );
            const displayProgress = Math.min(
              99,
              Math.max(5, percentageCompleted),
            );

            setFiles((prevFiles) =>
              prevFiles.map((f) =>
                f.id === fileId
                  ? { ...f, progress: Math.max(f.progress, displayProgress) }
                  : f,
              ),
            );
          };
          xhr.onload = () => {
            clearProgressTimer(job);
            if (xhr.status === 200 || xhr.status === 204) {
              setFiles((prevFiles) =>
                prevFiles.map((f) =>
                  f.id === fileId
                    ? { ...f, progress: 100, uploading: false, error: false }
                    : f,
                ),
              );

              toast.success("File uploaded successfully");
              resolve();
            } else {
              reject(new Error(`Upload failed with status: ${xhr.status}`));
            }
          };
          xhr.onerror = () => {
            clearProgressTimer(job);
            reject(new Error("Upload failed"));
          };
          xhr.onabort = () => {
            clearProgressTimer(job);
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
        clearProgressTimer(job);
        if (
          job.abortRequested ||
          (error as DOMException).name === "AbortError"
        ) {
          const cleaned = await cleanupS3Object(job.key);
          revokeObjectUrl(upload);
          uploadJobsRef.current.delete(fileId);
          setFiles((prevFiles) => prevFiles.filter((f) => f.id !== fileId));

          if (cleaned) {
            toast.success("Upload cancelled");
          } else {
            toast.error("Upload cancelled, but S3 cleanup failed");
          }
          return;
        }

        toast.error("Upload failed");
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.id === fileId
              ? { ...f, uploading: false, progress: 0, error: true }
              : f,
          ),
        );
      } finally {
        clearProgressTimer(job);
        if (!job.abortRequested) {
          uploadJobsRef.current.delete(fileId);
        }
      }
    },
    [cleanupS3Object],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      const droppedFileCount = acceptedFiles.length + fileRejections.length;
      const errorCodes = getRejectionErrorCodes(fileRejections);

      if (droppedFileCount > MAX_FILES || errorCodes.has("too-many-files")) {
        toast.error(`You can only upload up to ${MAX_FILES} files.`);
      }

      if (errorCodes.has("file-too-large")) {
        toast.error(`Each file must be less than ${MAX_FILE_SIZE_MB}MB.`);
      }

      if (acceptedFiles.length > 0) {
        const uploads: UploadFile[] = acceptedFiles.map((file) => {
          const isImage = file.type.startsWith("image/");

          return {
            id: uuidv4(),
            file,
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
        uploads.forEach(uploadFile);
      }
    },
    [uploadFile],
  );
  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    console.log("rejected:", fileRejections);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    maxFiles: MAX_FILES,
    maxSize: MAX_FILE_SIZE,
  });

  const confirmationFile = confirmation
    ? files.find((file) => file.id === confirmation.fileId)
    : undefined;
  const isCancelConfirmation = confirmation?.type === "cancel";

  return (
    <>
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
          {isDragActive ? (
            <p className="text-center">Drop the files here ...</p>
          ) : (
            <div className="flex flex-col items-center justify-center h-full w-full gap-y-3">
              <p>Drag and drop some files here, or click to select files</p>
              <Button>Select files</Button>
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
                aria-label={file.uploading ? "Cancel upload" : "Delete file"}
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
                  <p className="text-white font-medium text-lg">Error</p>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground truncate">
              {file.file.name}
            </p>
            {!file.isImage && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileIcon className="size-3" />
                <span className="truncate">
                  {file.file.type || "Unknown file type"}
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
              {isCancelConfirmation ? "Cancel upload?" : "Delete this file?"}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              {isCancelConfirmation
                ? "The upload will stop now and any unfinished S3 object will be cleaned up."
                : "This will permanently remove the file from S3."}
            </AlertDialog.Description>

            {confirmationFile && (
              <p className="mt-3 truncate rounded-md bg-muted px-3 py-2 text-sm">
                {confirmationFile.file.name}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Keep</Button>
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
                  {isCancelConfirmation ? "Cancel upload" : "Delete"}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
