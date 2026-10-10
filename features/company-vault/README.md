# Company Vault

Conventus Company Vault gives each company an isolated document area. MongoDB stores folder metadata, file metadata, upload sessions, quota reservations, and usage. File bytes live in Bunny.net Storage and are accessed only through authenticated Conventus server routes.

## Plan entitlements and exact limits

The **Plans** admin editor controls the **Cloud vault** entitlement. It is disabled by default on every plan. When enabled, the admin assigns the company's storage quota (GB or TB), maximum size per file, and maximum stored item count. The server resolves these settings from the company's active plan; a company without the entitlement receives a 403 and cannot list, upload, download, rename, or delete vault data through the API.

GB/TB values are converted to bytes using powers of 1024 (1 GB = 1,073,741,824 bytes; 1 TB = 1,099,511,627,776 bytes). Values displayed in the plan editor and public plan cards use those same byte values. Admin plan edits apply to live entitlement resolution; existing usage above a lowered quota remains visible to the administrator, but new uploads are refused until usage fits the cap. The global hard maximum per file is 250 MiB to protect production workloads. The default plan-editor per-file cap is 100 MiB. Each batch is limited to 25 files; the plan can also set a lower lifetime stored-item limit.

## Configure Bunny Storage

Set these variables in the server environment (for example, Vercel Project Settings or the local .env.local file):

- **BUNNY_STORAGE_ZONE**: the Bunny Storage Zone name.
- **BUNNY_STORAGE_PASSWORD**: the Storage Zone password. Never use a storage credential in browser code or a NEXT_PUBLIC_ variable.
- **BUNNY_STORAGE_ENDPOINT**: optional HTTPS regional endpoint, default https://storage.bunnycdn.com.
- **BUNNY_VAULT_QUOTA_BYTES** and **BUNNY_VAULT_MAX_FILE_BYTES**: compatibility/default values for legacy or default initialization only; an enabled plan's quota and file limit are authoritative.

Use a dedicated Storage Zone for private vault data and **do not connect it to a publicly reachable Pull Zone**. All downloads are proxied by the authenticated API, which never exposes the Storage Zone password.

## Storage layout and resource safety

Every company uses a stable root named company- followed by its immutable MongoDB company ID. The public company name and public slug are not authorization inputs and changing either never changes the storage root. Folder trees are metadata-only: a new folder does not write a .conventus-folder or .conventus-vault marker object to Bunny. Folder delete requests remove old marker objects left by previous builds.

Uploads use 3 MiB chunks, sequentially; byte and item slots are atomically reserved in MongoDB before chunk upload starts. The completed file is streamed from Bunny staging objects into its final Bunny object, so the app does not read or concatenate the entire file in RAM. Staging keys are private server-side implementation details. Abandoned upload sessions expire after six hours; cleanup is retried when a company accesses the vault API.

Images (except SVG), common videos, PDFs, and safe plain-text/CSV/JSON content have in-app previews through the authenticated file route. Word, Excel, PowerPoint, and other formats remain downloadable but are not passed to a third-party preview service. There is no public download URL or public Pull Zone requirement.

## Tenant, usage, and administration

- Server routes derive company and workspace identity from the authenticated session and active membership; clients cannot supply another company ID.
- File/folder queries are scoped by company and workspace. Quota and item reservations are company-wide, so workspaces under one company cannot multiply its storage allowance.
- The /admin/vault-usage view reports usage, assigned quota, stored items, active uploads, plan entitlement, and file counts per company.
- File downloads include private cache, nosniff, and same-origin resource headers. Bunny credentials remain server-only.
