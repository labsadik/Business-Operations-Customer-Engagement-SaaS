# Production deployment: Canvas by AlgoQuit on Google Cloud

This guide deploys the Next.js application as a container on Google Cloud Run. Cloud Run is the web/API runtime; it does not replace the external services already used by the application.

## Target architecture

- Cloud Run: stateless Next.js server/API, running the Docker image as a non-root user on port 8080.
- Artifact Registry: container images.
- Cloud Build: optional build-and-deploy trigger after the first service deployment.
- MongoDB Atlas on Google Cloud: primary application database. Use MONGODB_DB_NAME=Canvas in production.
- Upstash Redis: distributed locks and coordination.
- Secret Manager: database URI, auth/encryption secrets, provider secrets and the cron secret.
- Cloud Scheduler: invokes the protected maintenance endpoints.
- External providers: Google OAuth/Calendar/Meet, Razorpay, Bunny Storage, and optional Sentry/Axiom/analytics.

Cloud Run instances can scale to zero or be replaced at any time. Do not store user files or durable state on the container filesystem; Vault files are stored by the existing Bunny Storage integration.

## 1. Choose your production URL and databases first

Choose your permanent HTTPS origin before building the image, for example https://app.yourdomain.com. NEXT_PUBLIC_* values are compiled into the browser bundle, so changing only Cloud Run runtime variables will not change browser code; rebuild the image after changing these public values.

Use separate databases:

- Production: MONGODB_DB_NAME=Canvas
- Test/demo only: MONGODB_DB_NAME=canvas_test

Set MONGODB_URI to the Atlas connection string and give its database user read/write access to the production database. The app passes MONGODB_DB_NAME to Mongoose, so that variable determines the database to use.

For production network security, prefer Atlas private networking/peering or Cloud Run static egress through VPC + Cloud NAT, then allowlist the resulting stable IP in Atlas. Do not broadly expose the database to the internet just to make deployment easy.

## 2. Prepare Google Cloud

Install Docker Desktop and the Google Cloud CLI, then open PowerShell in the repository root after pulling the latest main branch.

Replace YOUR_GCP_PROJECT_ID with your actual project ID:

~~~powershell
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com
gcloud artifacts repositories create canvas --repository-format=docker --location=asia-south1 --description="Canvas by AlgoQuit production images"
gcloud auth configure-docker asia-south1-docker.pkg.dev
gcloud iam service-accounts create canvas-runtime --display-name="Canvas Cloud Run runtime"
~~~

If the Artifact Registry repository or service account already exists, skip its create command.

## 3. Put credentials into Secret Manager

Create a secret for each of these values in Google Cloud Console → Security → Secret Manager. Do not commit real values to .env, .env.local, YAML, Docker build arguments, or Git.

Required secret IDs:

| Secret ID | Value |
| --- | --- |
| MONGODB_URI | MongoDB Atlas connection URI |
| REDIS_TOKEN | Upstash REST token |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret |
| AUTH_SECRET | Long random application/session signing secret |
| ENCRYPTION_KEY | Application encryption key; generate a fresh 32-byte base64url value |
| CRON_SECRET | Long random secret used to protect maintenance endpoints |
| BUNNY_STORAGE_PASSWORD | Bunny Storage password/API credential |
| RAZORPAY_KEY_SECRET | Razorpay API secret |
| RAZORPAY_WEBHOOK_SECRET | Razorpay webhook signing secret |

Generate fresh random secrets in PowerShell (run separately for each secret; never reuse one value for all keys):

~~~powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
~~~

Grant the Cloud Run runtime service account access to each secret at the secret level. Run this after the secrets exist:

~~~powershell
$projectId = (gcloud config get-value project).Trim()
$runtimeSa = "canvas-runtime@$projectId.iam.gserviceaccount.com"
$secretIds = @("MONGODB_URI", "REDIS_TOKEN", "GOOGLE_CLIENT_SECRET", "AUTH_SECRET", "ENCRYPTION_KEY", "CRON_SECRET", "BUNNY_STORAGE_PASSWORD", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET")
foreach ($secretId in $secretIds) {
  gcloud secrets add-iam-policy-binding $secretId --member="serviceAccount:$runtimeSa" --role="roles/secretmanager.secretAccessor"
}
~~~

Optional integrations can be disabled by leaving their variables unset, except MongoDB and Redis are required for a healthy production deployment. Add optional secrets such as SENTRY_DSN and AXIOM_TOKEN to Secret Manager and the deploy command if you use them.

## 4. Build and push the Docker image

Use the final public HTTPS URL you selected in step 1. Run this from PowerShell at the repository root:

~~~powershell
$env:PROJECT_ID = (gcloud config get-value project).Trim()
$env:REGION = "asia-south1"
$env:REPOSITORY = "canvas"
$env:IMAGE = "canvas-web"
$env:TAG = (git rev-parse --short HEAD).Trim()
$env:APP_URL = "https://app.yourdomain.com"
$env:IMAGE_URI = "$($env:REGION)-docker.pkg.dev/$($env:PROJECT_ID)/$($env:REPOSITORY)/$($env:IMAGE):$($env:TAG)"
docker build --pull -t $env:IMAGE_URI --build-arg "NEXT_PUBLIC_APP_URL=$($env:APP_URL)" --build-arg "NEXT_PUBLIC_APP_NAME=Canvas" --build-arg "NEXT_PUBLIC_COMPANY_NAME=AlgoQuit" .
docker push $env:IMAGE_URI
~~~

Replace https://app.yourdomain.com with your actual domain. The Dockerfile uses Next.js standalone output, installs dependencies in a separate stage, excludes local environment files from the build context, and runs the container as the unprivileged nextjs user. Optional NEXT_PUBLIC_* analytics/Sentry settings can be passed as additional build arguments if enabled.

## 5. Deploy the first Cloud Run service

Before running this command, replace the sample values below with your actual non-secret integration values. Create the corresponding Secret Manager secrets in step 3 first.

~~~powershell
gcloud run deploy canvas-web --image $env:IMAGE_URI --region $env:REGION --platform managed --port 8080 --allow-unauthenticated --service-account $runtimeSa --cpu 1 --memory 1Gi --concurrency 40 --timeout 300 --max 10 --set-env-vars="NODE_ENV=production,MONGODB_DB_NAME=Canvas,NEXT_PUBLIC_APP_URL=$($env:APP_URL),NEXT_PUBLIC_APP_NAME=Canvas,NEXT_PUBLIC_COMPANY_NAME=AlgoQuit,GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID,GOOGLE_REDIRECT_URI=$($env:APP_URL)/api/auth/google/callback,REDIS_URL=YOUR_UPSTASH_REDIS_REST_URL,BUNNY_STORAGE_ZONE=YOUR_BUNNY_STORAGE_ZONE,BUNNY_STORAGE_ENDPOINT=https://storage.bunnycdn.com,BUNNY_VAULT_QUOTA_BYTES=5368709120,BUNNY_VAULT_MAX_FILE_BYTES=104857600,RAZORPAY_KEY_ID=YOUR_RAZORPAY_KEY_ID,AXIOM_SERVICE_NAME=canvas" --set-secrets="MONGODB_URI=MONGODB_URI:latest,REDIS_TOKEN=REDIS_TOKEN:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,AUTH_SECRET=AUTH_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,CRON_SECRET=CRON_SECRET:latest,BUNNY_STORAGE_PASSWORD=BUNNY_STORAGE_PASSWORD:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET:latest,RAZORPAY_WEBHOOK_SECRET=RAZORPAY_WEBHOOK_SECRET:latest"
~~~

The command's set-env-vars option replaces the service's existing plain environment variable list. Use it for the first deploy only, or include all required plain variables when intentionally replacing the list. For later changes, use update-env-vars/update-secrets so unrelated configuration is not accidentally removed.

The service is intentionally public because customer booking pages and public embeds must be reachable without Google Cloud IAM login. Application routes still enforce their own login, tenant and role checks. Maintenance routes additionally require the CRON_SECRET bearer token.

## 6. Configure the external callbacks

After the service is deployed, map your custom domain to Cloud Run using the domain setup supported for your project, or put an external HTTPS Application Load Balancer in front of it.

Then configure:

- Google OAuth authorized redirect URI: https://app.yourdomain.com/api/auth/google/callback (must equal GOOGLE_REDIRECT_URI exactly).
- Razorpay webhook URL: https://app.yourdomain.com/api/webhooks/razorpay.
- Cloud Scheduler must call the deployed HTTPS origin, not localhost.
- Update NEXT_PUBLIC_APP_URL and GOOGLE_REDIRECT_URI and rebuild/redeploy if the permanent domain differs from the one used in the image.

## 7. Schedule the maintenance endpoints

Create three Cloud Scheduler HTTP jobs in a region close to the service. Each should use method GET and the deployed HTTPS URL, with the request header:

Authorization: Bearer <the same value stored in CRON_SECRET>

Do not include the secret in the URL or in source control.

| Job | HTTP path | Suggested schedule |
| --- | --- | --- |
| Booking expiry/retry sweep | /api/jobs/sweep | Every minute: * * * * * |
| Vault upload cleanup | /api/jobs/vault-upload-cleanup | Every 15 minutes: */15 * * * * |
| Live Chat retention cleanup | /api/jobs/live-chat-retention | Daily at 03:17: 17 3 * * * |

Set the Scheduler timezone intentionally (UTC is simplest). Restrict who can view/edit Scheduler jobs because the custom header contains the maintenance secret.

## Redis runtime contract

Set `REDIS_URL` to the Upstash Redis REST HTTPS endpoint and `REDIS_TOKEN` to its REST token through Secret Manager. The runtime also accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for compatibility. Never expose the token through a `NEXT_PUBLIC_*` variable.

Redis stores only temporary availability results (75-second TTL) and distributed lock keys under the `conventus:lock:v1:` namespace for booking/meeting state transitions, the booking sweep, and live-chat conversation creation. MongoDB remains authoritative for application records. Production lock-protected API operations and the booking sweep fail closed with HTTP 503 if Redis is missing or unavailable; configure and verify Redis before sending production booking traffic.

## 8. Verify the live service

Run these checks after deployment:

1. Open https://app.yourdomain.com/api/health. A healthy service returns HTTP 200 with both mongo and redis equal to ok. It returns 503 when either dependency is not healthy.
2. Sign in with Google and verify that the OAuth callback uses the production domain.
3. Create one fresh company/workspace. The app's plan catalog bootstraps built-in plans on demand; do not run npm run seed:demo in production. That demo seeder deliberately refuses any database other than canvas_test.
4. Test booking creation, assignment, Google Calendar/Meet creation, Razorpay checkout/webhook, Vault upload/download, task assignment, and each scheduled endpoint.
5. Check Cloud Run → Logs for runtime errors and Cloud Monitoring for instance restarts, latency and 5xx responses.

If company creation returns FREE_PLAN_NOT_CONFIGURED, first check the Cloud Run revision's MONGODB_DB_NAME=Canvas, that the MONGODB_URI secret points to the expected cluster, and that its database user has write permissions. The production app automatically ensures the plan catalog; this error means seeding/verification failed, so inspect the preceding plan-catalog/MongoDB error in Cloud Run logs rather than loading demo data.

## 9. Subsequent builds and production practices

After the first service exists and its runtime configuration is correct, cloudbuild.yaml can build, push and deploy new revisions. Configure a Cloud Build trigger for the protected main branch and set the _NEXT_PUBLIC_APP_URL substitution to the final URL. Give the Cloud Build service account permission to push to Artifact Registry, deploy Cloud Run, and act as the chosen runtime service account. The deploy step updates the image while preserving existing Cloud Run runtime configuration.

For production, enable database backups/point-in-time recovery, monitor Cloud Run 5xx and database connection saturation, rotate secrets through Secret Manager, and test restores before real customer data is onboarded. Start with the 1 CPU / 1 GiB setting above and tune based on observed latency, memory and cost. Consider one minimum instance if cold-start latency is unacceptable.
