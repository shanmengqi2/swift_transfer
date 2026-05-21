import assert from "node:assert/strict";
import {
  createUploadObjectKey,
  getDisplayFileName,
  getObjectDisplayPath,
  getObjectParentPath,
} from "../lib/files.ts";

const id = "123e4567-e89b-12d3-a456-426614174000";

assert.equal(getDisplayFileName(`${id}-report.pdf`), "report.pdf");
assert.equal(
  getDisplayFileName(`reports/2026/${id}-report.pdf`),
  "report.pdf",
);
assert.equal(
  getObjectDisplayPath(`reports/2026/${id}-report.pdf`),
  "reports/2026/report.pdf",
);
assert.equal(
  getObjectParentPath(`reports/2026/${id}-report.pdf`),
  "reports/2026",
);
assert.equal(
  getObjectDisplayPath(`${id}-reports/${id}-report.pdf`),
  `${id}-reports/report.pdf`,
);
assert.equal(
  createUploadObjectKey({ id, fileName: "App.app.zip" }),
  `${id}-App.app`,
);
assert.equal(
  createUploadObjectKey({
    id,
    fileName: "report.pdf",
    relativePath: "reports/2026/report.pdf",
  }),
  "reports/2026/123e4567-e89b-12d3-a456-426614174000-report.pdf",
);

for (const relativePath of [
  "/report.pdf",
  "reports//report.pdf",
  "reports/../report.pdf",
  "reports/./report.pdf",
  "reports/other.pdf",
]) {
  assert.throws(() =>
    createUploadObjectKey({
      id,
      fileName: "report.pdf",
      relativePath,
    }),
  );
}

console.log("storage path helper tests passed");
