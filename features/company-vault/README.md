# Company Vault

Conventus Company Vault gives each authenticated company a private document area. MongoDB stores the folder tree, file metadata, upload sessions, and storage quota. File bytes are stored in a Bunny.net Storage Zone using the server-side Storage Zone password.

## Configure Bunny Storage

Set these variables in the server environment (for example, Vercel Project Settings or .env.local):

- **BUNNY_STORAGE_ZONE**: the existing Bunny Storage Zone name.
- **BUNNY_STORAGE_PASSWORD**: the Storage Zone password. Never use a storage credential in browser code or a NEXT_PUBLIC_ variable.
- **BUNNY_STORAGE_ENDPOINT**: optional HTTPS regional endpoint, defaulting to https://storage.bunnycdn.com. Use the endpoint for the Storage Zone's configured primary region when required.
- **BUNNY_VAULT_QUOTA_BYTES**: default per-company quota in bytes for newly initialized vaults. Default: 5 GiB. The quota is persisted in MongoDB on first use.
- **BUNNY_VAULT_MAX_FILE_BYTES**: maximum size for an individual upload. Default: 100 MiB; the implementation caps this at 250 MiB because completion assembles chunks in server memory.

Use a dedicated Storage Zone for private Conventus vault data, and do not connect it to a publicly reachable Pull Zone. Bunny explains that Storage Zone files are not publicly reachable on their own; a Pull Zone is what serves them over HTTP. Linking this zone to a public Pull Zone would bypass the application's authenticated download route unless you separately enforce token/access controls at the CDN layer. Keep vault downloads proxied through Conventus.

Restart/redeploy the application after adding environment variables. Existing company quotas are stored in MongoDB and will not automatically change when the default quota variable changes.

## Storage layout

The Bunny Storage Zone stores each tenant beneath a root similar to acme-labs-65f..., formed from the company's slug and immutable MongoDB company ID. This keeps company names readable while preventing slug collisions. The root contains a hidden .conventus-vault marker, and folder objects are stored under stable ID-based paths, with a hidden marker for each folder. Stable folder IDs let users rename folders without moving every stored file. The UI shows company-defined folder names from tenant-scoped MongoDB metadata.

The browser never receives the Storage Zone password. It starts an upload through the authenticated API, sends 3 MiB chunks to server routes, and asks the server to assemble the completed file into Bunny Storage. Downloads are proxied by an authenticated route; the response uses attachment disposition and nosniff headers. Folder and file deletion removes the associated Bunny objects and tenant-scoped MongoDB metadata.

## Tenant and usage controls

- Every route derives company/workspace identity from the active server session and current membership. It does not accept a company ID from the browser.
- Reads, edits, downloads, and deletes include company and workspace conditions in MongoDB queries.
- Each upload reserves quota atomically before receiving chunks. Abandoned sessions expire after six hours and are cleaned on the next company vault API request.
- A company may have root-level files or create arbitrarily nested folders.
- Deleting a folder recursively deletes its stored files and subfolders.

Bunny credentials, MongoDB, and the application's production HTTPS/session settings must be configured before using this feature in production.
