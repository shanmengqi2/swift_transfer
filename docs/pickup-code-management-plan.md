# Pickup Code Management Plan

## Goal

Build pickup code management around two complementary views:

- A pickup-code view for managing share containers directly.
- A file-centric entry point for quickly seeing which pickup codes include a file.

This keeps pickup codes visible as first-class sharing records while preserving the file manager as the natural place to inspect file-specific sharing.

## Recommended Shape

### Pickup Code List

Add a protected `/pickup-codes` page that lists all pickup codes with enough context to scan quickly:

- Code.
- Status: active, expired, permanent, and later revoked.
- Expiration time.
- Created time.
- File count.
- Automatic file summary.
- Missing-file count when any associated object has been deleted.

The file summary should be generated automatically so code creation stays fast:

- 1 file: show the file name.
- 2-3 files: show the visible file names.
- More files: show the first 2 file names plus `+ N more`.
- Secondary metadata: total file count, total size when known, and missing count.

An optional title or note can be added later, but it should not be required during quick sharing.

### Pickup Code Detail

Add `/pickup-codes/[id]` after the list page. This should be the main editing surface:

- Copy pickup link.
- Change expiration, including permanent.
- Add files.
- Remove files.
- Show missing files with their saved snapshot names.
- Revoke the pickup code.

### File Manager Entry

Keep the existing file manager badge showing how many pickup codes include each file. Add a file action later:

- `View pickup codes`.
- Show a compact dialog or drawer with pickup codes that contain the file.
- Link each row to `/pickup-codes/[id]`.

This supports the question: “Where is this file currently shared?”

## Data Model Direction

Current tables:

- `pickup_codes`
- `pickup_code_files`

Near-term additions:

- `pickup_codes.updated_at`
- `pickup_codes.revoked_at`
- Optional `pickup_codes.title`

Keep `pickup_code_files.file_name` and `pickup_code_files.size` as snapshots so deleted S3 objects can still be displayed intelligibly.

## Implementation Order

1. Add `/pickup-codes` list page with automatic file summary. **Done.**
2. Add `/pickup-codes/[id]` detail page with expiration editing and revoke. **Done.**
3. Add file add/remove operations in the detail page. **Current.**
4. Add file-manager action for “View pickup codes”.
5. Add optional title/note only if the automatic summary proves insufficient.
6. Add later security/admin hardening such as brute-force protection and audit fields.

## Current Step

Implement step 3:

- Add protected API actions for adding files to a pickup code.
- Add protected API actions for removing files from a pickup code.
- Update `/pickup-codes/[id]` so administrators can add existing S3 files and remove associated files.
- Keep S3 objects intact when removing a file from a pickup code.
- Disable file membership edits for revoked pickup codes.
