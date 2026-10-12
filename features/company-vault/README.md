# Company Vault

Canvas Company Vault gives each company an isolated document area. MongoDB stores folder metadata, file metadata, upload sessions, quota reservations, and usage. File bytes live in Bunny.net Storage and are accessed through authenticated Canvas server routes.

## Plan entitlements and exact limits

The Plans admin editor controls the Cloud vault entitlement. It is disabled by default on every plan. When enabled, an administrator assigns the company's storage quota (GB or TB), maximum size per file, and maximum uploaded-file count. Server routes resolve these limits from the current company plan; companies without the entitlement are denied vault API access.

Storage units use powers of 1024: 1 GB = 1,073,741,824 bytes and 1 TB = 1,099,511,627,776 bytes. Admin and pricing views format the stored byte value instead of creating a second quota. Plan edits are applied by the server on the next request. If a limit is reduced below current usage, stored items remain available for review/download according to entitlement access, but further uploads are blocked until usage fits the new limit. The per-file hard cap is 250 MiB, regardless of the plan; plan UI defaults to 100 MiB. Upload batches are limited to 25 files.

## Bunny configuration and access

Set BUNNY_STORAGE_ZONE, BUNNY_STORAGE_PASSWORD, and optionally BUNNY_STORAGE_ENDPOINT in the server environment. Never put a Bunny credential in browser code or a NEXT_PUBLIC_ variable. BUNNY_VAULT_QUOTA_BYTES and BUNNY_VAULT_MAX_FILE_BYTES are compatibility defaults; enabled plan settings are authoritative.

Use a dedicated Storage Zone that is not connected to a public Pull Zone. Downloads are streamed through authenticated application routes, with private caching and content-security headers. The Storage Zone password never leaves the server.

## Storage layout and performance

Every company uses a stable prefix based on its immutable MongoDB company ID; company name and public slug do not determine the storage key. Folders and subfolders are MongoDB metadata only; creating them does not write placeholder/marker files to Bunny. Folder deletion also removes legacy marker objects from earlier builds.

Uploads are chunked into sequential 3 MiB requests. MongoDB atomically reserves bytes and an uploaded-file slot before allowing a new upload. On completion, the server streams staged Bunny objects into the final Bunny object rather than concatenating the complete file into RAM. The UI caps each batch at 25 files; the server separately enforces the plan file size, company byte quota, item cap, and 250 MiB hard cap. Abandoned uploads expire after six hours and are cleaned when the company next accesses vault APIs.

Images except SVG, common video formats, PDFs, and safe plain-text/CSV/JSON have authenticated inline previews. Office files are available as secure downloads and are not uploaded to a public third-party viewer. Office-document conversion previews would require a separate sandboxed conversion service.

## Tenant isolation and admin visibility

- Every vault route derives company/workspace identity from the authenticated server session and membership; client-supplied company IDs are not used.
- File/folder queries are tenant-scoped. Quota and item reservations are company-wide, so a second workspace cannot multiply the company's allowance.
- The /admin/vault-usage view displays each company's plan, enabled state, bytes used versus quota, stored item count versus cap, configured max file size, and active uploads.
- The admin endpoint is platform-admin-only and reports usage per company, not per public slug.
