# Production deployment: Canvas on Google Cloud Run

Cloud Run is the production web/API runtime. MongoDB, Redis, Google OAuth/Calendar/Meet, Razorpay and Bunny Storage remain external services. The repository includes a first-deploy script that reads a local .env file, stores private credentials in Secret Manager, builds through Cloud Build (no local Docker required), deploys Cloud Run, and creates the three maintenance Scheduler jobs.

## 1. One-time prerequisites

You need a Google Cloud project with billing enabled, permission to enable APIs, create Artifact Registry repositories and service accounts, manage Secret Manager, deploy Cloud Run, update IAM, and create Cloud Scheduler jobs. Install Google Cloud CLI and authenticate:

~~~powershell
gcloud auth login
~~~

Copy cloudrun.env.example to a local .env file in the repository root. Fill in the real Google Cloud project ID and the credentials for services you use. The .env file is ignored by Git and excluded from Cloud Build uploads and the container image.

~~~powershell
Copy-Item cloudrun.env.example .env
notepad .env
~~~

Required application values are MONGODB_URI, REDIS_URL and REDIS_TOKEN (or the equivalent UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, ENCRYPTION_KEY and CRON_SECRET. Generate separate strong values for AUTH_SECRET, ENCRYPTION_KEY and CRON_SECRET; for ENCRYPTION_KEY use a fresh 32-byte base64url value. Keep all provider secrets in the local .env only long enough for the script to load them—never paste secrets into GitHub or commit .env.

The default public origin is https://canvas.algoquit.com. Change NEXT_PUBLIC_APP_URL and GOOGLE_REDIRECT_URI in .env together if using a different origin. NEXT_PUBLIC_* values are build-time values and are passed to Cloud Build so the browser bundle matches the configured production domain.

## 2. Deploy from the repository

Run from the repository root in PowerShell:

~~~powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-cloud-run.ps1
~~~

The script will:

1. Enable Cloud Run, Artifact Registry, Cloud Build, Secret Manager and Cloud Scheduler APIs.
2. Create the Docker Artifact Registry repository and a dedicated non-root runtime service account if missing.
3. Grant the default Cloud Build identity permission to push images.
4. Create/update Secret Manager versions for populated secret values and grant the runtime identity access.
5. Build and push a tagged standalone Next.js container using Cloud Build.
6. Deploy a public Cloud Run service listening on port 8080, passing non-secret values as runtime environment variables and credentials as Secret Manager references.
7. Set scale-to-zero autoscaling with zero minimum instances, a configurable maximum instance count (default 10), 1 vCPU, 1 GiB memory, concurrency 40 and a 300-second request timeout.
8. Create or update Cloud Scheduler jobs for booking sweeps, Vault cleanup and Live Chat retention. Those jobs call the Cloud Run service URL with the CRON_SECRET bearer header.

The first deployment requires an existing GCP project and an identity with the permissions above. The script cannot create a billing account, provision external provider credentials, verify DNS ownership or change OAuth/Razorpay settings on your behalf. A one-click GitHub import by itself also does not read a local .env file; use this script to bootstrap the service, then optionally set up a Cloud Build trigger for later main-branch deploys.

Deployment controls can be tuned in .env:

| Key | Default | Purpose |
| --- | --- | --- |
| CLOUD_RUN_REGION | asia-south1 | Cloud Run, Artifact Registry and Scheduler region |
| CLOUD_RUN_SERVICE | canvas-web | Service name |
| CLOUD_RUN_MAX_INSTANCES | 10 | Cost guardrail and upper scaling bound |
| CLOUD_RUN_CONCURRENCY | 40 | Maximum simultaneous requests per instance |
| CLOUD_RUN_MEMORY | 1Gi | Memory per instance |

Minimum instances stay at zero to avoid idle-instance charges. A maximum-instance cap protects against unexpected spend but can limit throughput or produce queuing/503s during demand spikes. Raising the cap should follow load testing and database connection-capacity review, not be used as a substitute for tuning.

## 3. Configure the public domain and provider callbacks

After the service is deployed, configure the DNS records/domain mapping or an external HTTPS Application Load Balancer for Cloud Run. Confirm TLS is active before changing production traffic.

Then configure the exact provider callbacks:

- Google OAuth authorized redirect URI: the value of GOOGLE_REDIRECT_URI, normally https://canvas.algoquit.com/api/auth/google/callback.
- Razorpay webhook URL: https://canvas.algoquit.com/api/webhooks/razorpay.
- If a different public domain is selected, update NEXT_PUBLIC_APP_URL and GOOGLE_REDIRECT_URI, then rerun the deployment script so the browser bundle is rebuilt with the correct origin.

Do not remove the previous production route or switch DNS until the Cloud Run service passes its health and end-to-end smoke checks. The Vercel configuration file is no longer used by this repository; the current Vercel project/domain itself must be paused or deleted separately from the Vercel dashboard after the Cloud Run cutover is verified.

## 4. Cloud Scheduler jobs

The deploy script creates/updates these jobs in UTC using the service's generated Cloud Run URL, so Scheduler does not depend on custom-domain DNS propagation:

| Job | Endpoint | Schedule |
| --- | --- | --- |
| canvas-booking-sweep | /api/jobs/sweep | Every minute: * * * * * |
| canvas-vault-upload-cleanup | /api/jobs/vault-upload-cleanup | Every 15 minutes: */15 * * * * |
| canvas-live-chat-retention | /api/jobs/live-chat-retention | Daily at 03:17 UTC: 17 3 * * * |

CRON_SECRET is stored in Secret Manager for the runtime and used as a protected Scheduler HTTP header. Restrict Cloud Scheduler and Secret Manager IAM so only trusted operators can inspect or change these resources.

## 5. Subsequent deployments from main

Once the first service has been created, configure a Cloud Build trigger for the protected main branch using cloudbuild.yaml. Set its public substitutions to the correct production URL and brand/analytics values. The build config builds and pushes the image, then deploys a new revision to the existing Cloud Run service while preserving the service's configured runtime environment and scaling settings. Build and deployment identities must have access to Artifact Registry, Cloud Run and the runtime service account.

The first-deploy script deliberately uses a tagged image and does not depend on a Vercel build. Next.js standalone output contains the production server and traced dependencies, runs as a non-root user, and listens on 0.0.0.0:8080 as required by Cloud Run.

## 6. Production verification and capacity

Run checks after deployment:

1. Open the deployed service's /api/health endpoint. A healthy response is HTTP 200 with both MongoDB and Redis checks equal to ok; a missing or unhealthy required dependency returns 503.
2. Sign in with Google and verify the redirect/callback domain.
3. Verify booking creation, assignment, Calendar/Meet creation, Razorpay checkout/webhook, Vault upload/download, Task Management, Live Chat, and all three scheduled endpoints.
4. Check Cloud Run request logs and Cloud Monitoring for 5xx rate, p95/p99 latency, memory/CPU saturation, cold starts and instance restarts.
5. Enable MongoDB backups and point-in-time recovery, test restoring them, and monitor database connection pools before increasing max instances.

Cloud Run scales automatically with request demand, but no configuration alone can guarantee hundreds of thousands of simultaneous users or prevent all crashes. Practical capacity depends on request mix, app code, MongoDB/Redis quotas, Google API limits, connection pools, queueing and load tests. The default pool is intentionally small per instance. With 10 instances at pool size 5, the app can create up to roughly 50 MongoDB connections per process fleet for this Mongoose pool alone; include all other workers and applications when sizing Atlas. Use a production load test before raising the instance cap.

For cost protection, configure Google Cloud billing budgets/alerts and service quotas. Instance max limits help with unexpected spikes but may be briefly exceeded; a fixed cap prioritizes spend control over unlimited scale. Start with max 10 and increase only with observed capacity/cost data. Keep min instances at 0 unless measured cold-start latency warrants a paid warm instance.
