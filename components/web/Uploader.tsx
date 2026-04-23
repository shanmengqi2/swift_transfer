"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import type { FileRejection } from "react-dropzone";
import { toast } from "sonner";

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
            id: "akdjfklasjdklf",
            file,
            uploading: false,
            progress: 0,
            isDeleting: false,
            error: false,
            objectUrl: URL.createObjectURL(file),
          })),
        ]);
      }
      console.log(acceptedFiles);
    },
    [],
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
    </>
  );
}
