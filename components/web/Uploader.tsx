/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import type { FileRejection } from "react-dropzone";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Loader2, Trash2 } from "lucide-react";

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE = 1024 * 1024 * MAX_FILE_SIZE_MB;

function getRejectionErrorCodes(fileRejections: FileRejection[]) {
  return new Set(
    fileRejections.flatMap((fileRejection) =>
      fileRejection.errors.map((error) => error.code),
    ),
  );
}

export function Uploader() {
  const [files, setFiles] = useState<
    Array<{
      id: string;
      file: File;
      uploading: boolean;
      progress: number;
      key?: string;
      isDeleting: boolean;
      error: boolean;
      objectUrl?: string;
    }>
  >([]);

  const removeFile = async (fileId: string) => {
    try {
      const fileToRemove = files.find((f) => f.id === fileId);
      if (fileToRemove) {
        if (fileToRemove.objectUrl) {
          URL.revokeObjectURL(fileToRemove.objectUrl);
        }
      }
      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.id === fileId ? { ...f, isDeleting: true } : f,
        ),
      );

      const deleteFileResponse = await fetch("/api/s3/delete", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: fileToRemove?.key,
        }),
      });
      if (!deleteFileResponse.ok) {
        toast.error("Failed to delete file");
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.id === fileId ? { ...f, isDeleting: false, error: true } : f,
          ),
        );

        return;
      }

      // setFiles((prevFiles) =>
      //   prevFiles.map((f) =>
      //     f.id === fileId ? { ...f, isDeleting: false, error: false } : f,
      //   ),
      // );
      toast.success("File deleted successfully");
      setFiles((prevFiles) => prevFiles.filter((f) => f.id !== fileId));
    } catch {
      toast.error("Failed to delte file");
      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.id === fileId ? { ...f, isDeleting: false, error: true } : f,
        ),
      );
    }
  };

  const uploadFile = useCallback(async (file: File) => {
    console.log("uploading", file);
    setFiles((prevFiles) =>
      prevFiles.map((f) => (f.file === file ? { ...f, uploading: true } : f)),
    );
    try {
      const presignedUrlResponse = await fetch("/api/s3/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      if (!presignedUrlResponse.ok) {
        toast.error("failed to get Presigned Url");
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.file === file
              ? { ...f, uploading: false, progress: 0, error: true }
              : f,
          ),
        );
        return;
      }

      const { presignedUrl, uniqueKey } = await presignedUrlResponse.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentageCompleted = (event.loaded / event.total) * 100;
            setFiles((prevFiles) =>
              prevFiles.map((f) =>
                f.file === file
                  ? {
                      ...f,
                      progress: Math.round(percentageCompleted),
                      key: uniqueKey,
                    }
                  : f,
              ),
            );
          }
        };
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 204) {
            setFiles((prevFiles) =>
              prevFiles.map((f) =>
                f.file === file
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
          reject(new Error("Upload failed"));
        };

        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });
    } catch {
      toast.error("Upload failed");
      setFiles((prevFiles) =>
        prevFiles.map((f) =>
          f.file === file
            ? { ...f, uploading: false, progress: 0, error: true }
            : f,
        ),
      );
    }
  }, []);

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

      // Do something with the files
      if (acceptedFiles.length > 0) {
        setFiles((prevFiles) => [
          ...prevFiles,
          ...acceptedFiles.map((file) => ({
            id: uuidv4(),
            file,
            uploading: false,
            progress: 0,
            isDeleting: false,
            error: false,
            objectUrl: URL.createObjectURL(file),
          })),
        ]);
      }
      // console.log(acceptedFiles);
      acceptedFiles.forEach(uploadFile);
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
    accept: {
      "image/*": [],
    },
  });
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
                src={file.objectUrl}
                alt={file.file.name}
                className="w-full h-full object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => removeFile(file.id)}
                disabled={file.uploading || file.isDeleting}
              >
                {file.isDeleting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
              {file.uploading && !file.isDeleting && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <p className="text-white font-medium text-lg">
                    {file.progress}%
                  </p>
                </div>
              )}

              {file.error && (
                <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                  <p className="text-white font-medium text-lg">Error</p>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground truncate">
              {file.file.name}
            </p>
          </div>
          // <div key={file.id} className="relative">
          //   <img
          //     src={file.objectUrl}
          //     alt={file.file.name}
          //     className="w-full h-auto rounded-xl"
          //   />
          //   <p>{file.progress}%</p>
          //   <Button
          //     variant="ghost"
          //     size="sm"
          //     className="absolute top-2 right-2"
          //     onClick={() =>
          //       setFiles((prev) => prev.filter((f) => f.id !== file.id))
          //     }
          //   >
          //     {/*<TrashIcon className="h-4 w-4" />*/}
          //   </Button>
          // </div>
        ))}
      </div>
    </>
  );
}
