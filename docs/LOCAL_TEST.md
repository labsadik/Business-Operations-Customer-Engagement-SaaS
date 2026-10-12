# Local VS Code test

## Windows PowerShell

```powershell
git clone https://github.com/WorkRCS/canvas-v1.git
cd canvas-v1
git pull origin main

Copy-Item .env.example .env.local
npm install

npm run typecheck
npm run lint
npm run build

npm run dev
```

Open:
- http://localhost:3000
- http://localhost:3000/login

After Google OAuth is configured:
- http://localhost:3000/login
- create a workspace
- connect Google
- publish the public company page
- open /<company-slug>
- sign in as a customer
- choose a slot and request a meeting
- accept from the employee/company dashboard
- verify /<company-slug>/meet/<meeting-id>

## Required local environment

Set these in .env.local:
- MONGODB_URI
- MONGODB_DB_NAME=Canvas
- REDIS_URL
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI
- AUTH_SECRET
- ENCRYPTION_KEY

Generate a 32-byte base64url ENCRYPTION_KEY and a long AUTH_SECRET. Do not commit .env.local.

MongoDB database: `MONGODB_DB_NAME=Canvas` keeps the application out of the `test` database.

## Health check

With MongoDB and Redis configured:

```powershell
Invoke-WebRequest http://localhost:3000/api/health | Select-Object -ExpandProperty Content
```

Expected shape:

```json
{"service":"canvas","status":"ok","checks":{"mongo":"ok","redis":"ok"}}
```

A missing local service should show `degraded`, not be mistaken for a successful production configuration.

## Company-scoped employee login

Each company now has its own login page:

```
/<company-slug>/login
```

The page renders the company member/employee email list. Google sign-in is accepted only when the Google email is already an active company member or matches an active pending employee invitation. A rejected email does not create a session.

The public page `/<company-slug>` uses the same Google entry point but resolves access server-side:
- company member/employee → `/dashboard`
- non-member Google account → customer booking flow

## Company owner employee management

The company owner can add employees by email and remove active employee memberships from the dashboard. Removal deactivates the membership and availability rules, marks the employee unavailable, and releases pending assigned requests for retry. The user account and Google credentials are retained for a future invitation.
