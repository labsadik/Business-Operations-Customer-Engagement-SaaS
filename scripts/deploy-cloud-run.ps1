param(
  [string]$EnvFile = ".env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw "Google Cloud CLI (gcloud) is required. Install it and run gcloud auth login first."
  }

  $envPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $repoRoot $EnvFile }
  if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw "Environment file not found: $envPath. Copy cloudrun.env.example to .env and fill in the values."
  }

  $envValues = @{}
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*(#|$)') { continue }
    if ($line -notmatch '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      throw "Invalid .env line. Expected KEY=value; line contents were not printed."
    }
    $key = $Matches[1]
    $value = $Matches[2]
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $envValues[$key] = $value
  }

  function Get-Setting([string]$Name, [string]$DefaultValue = "") {
    if ($envValues.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace([string]$envValues[$Name])) {
      return ([string]$envValues[$Name]).Trim()
    }
    return $DefaultValue
  }

  function Invoke-Gcloud([string[]]$Arguments) {
    & gcloud @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "gcloud command failed with exit code $LASTEXITCODE. Review the command output above."
    }
  }

  $projectId = Get-Setting "CLOUD_RUN_PROJECT_ID"
  if (-not $projectId) {
    $activeProject = (& gcloud config get-value project --quiet 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $activeProject -and $activeProject -ne "(unset)") {
      $projectId = $activeProject
    }
  }
  if (-not $projectId -or $projectId -eq "your-google-cloud-project-id") {
    throw "Set CLOUD_RUN_PROJECT_ID in .env to the real Google Cloud project ID."
  }

  $region = Get-Setting "CLOUD_RUN_REGION" "asia-south1"
  $service = Get-Setting "CLOUD_RUN_SERVICE" "canvas-web"
  $repository = Get-Setting "CLOUD_RUN_REPOSITORY" "canvas"
  $imageName = Get-Setting "CLOUD_RUN_IMAGE" "canvas-web"
  $maxInstances = [int](Get-Setting "CLOUD_RUN_MAX_INSTANCES" "10")
  $concurrency = [int](Get-Setting "CLOUD_RUN_CONCURRENCY" "40")
  $memory = Get-Setting "CLOUD_RUN_MEMORY" "1Gi"
  if ($maxInstances -lt 1 -or $maxInstances -gt 1000) { throw "CLOUD_RUN_MAX_INSTANCES must be between 1 and 1000." }
  if ($concurrency -lt 1 -or $concurrency -gt 1000) { throw "CLOUD_RUN_CONCURRENCY must be between 1 and 1000." }
  if ($service -notmatch '^[a-z]([-a-z0-9]*[a-z0-9])?$') { throw "CLOUD_RUN_SERVICE must be a valid lowercase Cloud Run service name." }

  $appUrl = (Get-Setting "NEXT_PUBLIC_APP_URL" "https://canvas.algoquit.com").TrimEnd("/")
  try { $parsedAppUrl = [System.Uri]::new($appUrl) } catch { throw "NEXT_PUBLIC_APP_URL must be a valid HTTPS origin." }
  if ($parsedAppUrl.Scheme -ne "https" -or $parsedAppUrl.AbsolutePath -ne "/" -or $parsedAppUrl.Query -or $parsedAppUrl.Fragment) {
    throw "NEXT_PUBLIC_APP_URL must be an HTTPS origin with no path, query, or fragment."
  }

  $envValues["NEXT_PUBLIC_APP_URL"] = $appUrl
  $envValues["NEXT_PUBLIC_APP_NAME"] = Get-Setting "NEXT_PUBLIC_APP_NAME" "Canvas"
  $envValues["NEXT_PUBLIC_COMPANY_NAME"] = Get-Setting "NEXT_PUBLIC_COMPANY_NAME" "AlgoQuit"
  $envValues["NEXT_PUBLIC_COMPANY_URL"] = Get-Setting "NEXT_PUBLIC_COMPANY_URL" "https://algoquit.com"
  $envValues["MONGODB_DB_NAME"] = Get-Setting "MONGODB_DB_NAME" "Canvas"
  $envValues["GOOGLE_REDIRECT_URI"] = Get-Setting "GOOGLE_REDIRECT_URI" "$appUrl/api/auth/google/callback"
  $envValues["BUNNY_STORAGE_ENDPOINT"] = Get-Setting "BUNNY_STORAGE_ENDPOINT" "https://storage.bunnycdn.com"
  $envValues["AXIOM_SERVICE_NAME"] = Get-Setting "AXIOM_SERVICE_NAME" "canvas"
  $envValues["NODE_ENV"] = "production"
  $envValues["PORT"] = "8080"

  if (-not (Get-Setting "REDIS_URL") -and (Get-Setting "UPSTASH_REDIS_REST_URL")) {
    $envValues["REDIS_URL"] = Get-Setting "UPSTASH_REDIS_REST_URL"
  }
  if (-not (Get-Setting "REDIS_TOKEN") -and (Get-Setting "UPSTASH_REDIS_REST_TOKEN")) {
    $envValues["REDIS_TOKEN"] = Get-Setting "UPSTASH_REDIS_REST_TOKEN"
  }

  $required = @("MONGODB_URI", "REDIS_URL", "REDIS_TOKEN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_SECRET", "ENCRYPTION_KEY", "CRON_SECRET")
  $missing = @($required | Where-Object { -not $envValues.ContainsKey($_) -or [string]::IsNullOrWhiteSpace([string]$envValues[$_]) })
  if ($missing.Count -gt 0) {
    throw "Missing required environment values: $($missing -join ', '). Fill them in the local .env file; secret values will be uploaded to Secret Manager, not committed."
  }

  $buildSubstitutions = [ordered]@{
    _REGION = $region
    _REPOSITORY = $repository
    _IMAGE = $imageName
    _TAG = (Get-Date -Format "yyyyMMddHHmmss")
    _NEXT_PUBLIC_APP_URL = [string]$envValues["NEXT_PUBLIC_APP_URL"]
    _NEXT_PUBLIC_APP_NAME = [string]$envValues["NEXT_PUBLIC_APP_NAME"]
    _NEXT_PUBLIC_COMPANY_NAME = [string]$envValues["NEXT_PUBLIC_COMPANY_NAME"]
    _NEXT_PUBLIC_COMPANY_URL = [string]$envValues["NEXT_PUBLIC_COMPANY_URL"]
    _NEXT_PUBLIC_SENTRY_DSN = (Get-Setting "NEXT_PUBLIC_SENTRY_DSN")
    _NEXT_PUBLIC_SENTRY_ENVIRONMENT = (Get-Setting "NEXT_PUBLIC_SENTRY_ENVIRONMENT" "production")
    _NEXT_PUBLIC_SENTRY_RELEASE = (Get-Setting "NEXT_PUBLIC_SENTRY_RELEASE")
    _NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE = (Get-Setting "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE")
    _NEXT_PUBLIC_UMAMI_SCRIPT_URL = (Get-Setting "NEXT_PUBLIC_UMAMI_SCRIPT_URL")
    _NEXT_PUBLIC_UMAMI_WEBSITE_ID = (Get-Setting "NEXT_PUBLIC_UMAMI_WEBSITE_ID")
    _NEXT_PUBLIC_MIXPANEL_TOKEN = (Get-Setting "NEXT_PUBLIC_MIXPANEL_TOKEN")
    _NEXT_PUBLIC_CLARITY_PROJECT_ID = (Get-Setting "NEXT_PUBLIC_CLARITY_PROJECT_ID")
  }
  foreach ($entry in $buildSubstitutions.GetEnumerator()) {
    if ([string]$entry.Value -match '[,\r\n]') {
      throw "$($entry.Key) contains a comma or newline; Cloud Build substitutions cannot safely encode this value."
    }
  }
  $substitutionString = (($buildSubstitutions.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ",")

  Write-Host "Enabling required Google Cloud APIs in project $projectId..."
  Invoke-Gcloud @("services", "enable", "run.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com", "secretmanager.googleapis.com", "cloudscheduler.googleapis.com", "--project=$projectId")

  $repoFound = $false
  & gcloud artifacts repositories describe $repository --location=$region --project=$projectId --format="value(name)" *> $null
  $repoFound = ($LASTEXITCODE -eq 0)
  if (-not $repoFound) {
    Invoke-Gcloud @("artifacts", "repositories", "create", $repository, "--repository-format=docker", "--location=$region", "--description=Canvas Cloud Run images", "--project=$projectId")
  }

  $projectNumber = (& gcloud projects describe $projectId --format="value(projectNumber)" --project=$projectId | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $projectNumber) { throw "Could not read the Google Cloud project number." }
  $runtimeServiceAccount = "canvas-runtime@$projectId.iam.gserviceaccount.com"
  & gcloud iam service-accounts describe $runtimeServiceAccount --project=$projectId *> $null
  if ($LASTEXITCODE -ne 0) {
    Invoke-Gcloud @("iam", "service-accounts", "create", "canvas-runtime", "--display-name=Canvas Cloud Run runtime", "--project=$projectId")
  }

  # Google Cloud uses different default Cloud Build service accounts on older/newer projects.
  $writerGrants = 0
  foreach ($buildAccount in @("$projectNumber-compute@developer.gserviceaccount.com", "$projectNumber@cloudbuild.gserviceaccount.com")) {
    & gcloud artifacts repositories add-iam-policy-binding $repository --location=$region --member="serviceAccount:$buildAccount" --role="roles/artifactregistry.writer" --project=$projectId --quiet *> $null
    if ($LASTEXITCODE -eq 0) { $writerGrants++ }
  }
  if ($writerGrants -eq 0) { throw "Could not grant Cloud Build permission to push to Artifact Registry. Ensure the project owner can update repository IAM." }

  $secretValues = [ordered]@{
    MONGODB_URI = [string]$envValues["MONGODB_URI"]
    REDIS_TOKEN = [string]$envValues["REDIS_TOKEN"]
    GOOGLE_CLIENT_SECRET = [string]$envValues["GOOGLE_CLIENT_SECRET"]
    AUTH_SECRET = [string]$envValues["AUTH_SECRET"]
    ENCRYPTION_KEY = [string]$envValues["ENCRYPTION_KEY"]
    CRON_SECRET = [string]$envValues["CRON_SECRET"]
    BUNNY_STORAGE_PASSWORD = (Get-Setting "BUNNY_STORAGE_PASSWORD")
    RAZORPAY_KEY_SECRET = (Get-Setting "RAZORPAY_KEY_SECRET")
    RAZORPAY_WEBHOOK_SECRET = (Get-Setting "RAZORPAY_WEBHOOK_SECRET")
    AXIOM_TOKEN = (Get-Setting "AXIOM_TOKEN")
    SENTRY_AUTH_TOKEN = (Get-Setting "SENTRY_AUTH_TOKEN")
  }

  $secretIds = @()
  foreach ($entry in $secretValues.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.Value)) { continue }
    $secretId = [string]$entry.Key
    & gcloud secrets describe $secretId --project=$projectId --format="value(name)" *> $null
    if ($LASTEXITCODE -ne 0) {
      Invoke-Gcloud @("secrets", "create", $secretId, "--replication-policy=automatic", "--project=$projectId")
    }
    $tempSecretFile = [System.IO.Path]::GetTempFileName()
    try {
      [System.IO.File]::WriteAllText($tempSecretFile, [string]$entry.Value, [System.Text.UTF8Encoding]::new($false))
      Invoke-Gcloud @("secrets", "versions", "add", $secretId, "--data-file=$tempSecretFile", "--project=$projectId")
    }
    finally {
      Remove-Item -LiteralPath $tempSecretFile -Force -ErrorAction SilentlyContinue
    }
    Invoke-Gcloud @("secrets", "add-iam-policy-binding", $secretId, "--member=serviceAccount:$runtimeServiceAccount", "--role=roles/secretmanager.secretAccessor", "--project=$projectId", "--quiet")
    $secretIds += $secretId
  }

  $secretEnvironmentMap = [ordered]@{
    MONGODB_URI = "MONGODB_URI"
    REDIS_TOKEN = "REDIS_TOKEN"
    UPSTASH_REDIS_REST_TOKEN = "REDIS_TOKEN"
    GOOGLE_CLIENT_SECRET = "GOOGLE_CLIENT_SECRET"
    AUTH_SECRET = "AUTH_SECRET"
    ENCRYPTION_KEY = "ENCRYPTION_KEY"
    CRON_SECRET = "CRON_SECRET"
    BUNNY_STORAGE_PASSWORD = "BUNNY_STORAGE_PASSWORD"
    RAZORPAY_KEY_SECRET = "RAZORPAY_KEY_SECRET"
    RAZORPAY_WEBHOOK_SECRET = "RAZORPAY_WEBHOOK_SECRET"
    AXIOM_TOKEN = "AXIOM_TOKEN"
    SENTRY_AUTH_TOKEN = "SENTRY_AUTH_TOKEN"
  }
  $secretBindings = @()
  foreach ($entry in $secretEnvironmentMap.GetEnumerator()) {
    if ($secretIds -contains [string]$entry.Value) {
      $secretBindings += "$($entry.Key)=$($entry.Value):latest"
    }
  }

  $runtimeEnv = [ordered]@{}
  $deploymentOnlyKeys = @("CLOUD_RUN_PROJECT_ID", "CLOUD_RUN_REGION", "CLOUD_RUN_SERVICE", "CLOUD_RUN_REPOSITORY", "CLOUD_RUN_IMAGE", "CLOUD_RUN_MAX_INSTANCES", "CLOUD_RUN_CONCURRENCY", "CLOUD_RUN_MEMORY")
  $secretKeyNames = @($secretEnvironmentMap.Keys)
  foreach ($key in $envValues.Keys) {
    if ($key -in $deploymentOnlyKeys -or $key -in $secretKeyNames) { continue }
    if ([string]::IsNullOrWhiteSpace([string]$envValues[$key])) { continue }
    $runtimeEnv[$key] = [string]$envValues[$key]
  }
  $runtimeEnv["NODE_ENV"] = "production"
  $runtimeEnv["PORT"] = "8080"
  $runtimeEnv["MONGODB_DB_NAME"] = [string]$envValues["MONGODB_DB_NAME"]
  $runtimeEnv["REDIS_URL"] = [string]$envValues["REDIS_URL"]
  $runtimeEnv["NEXT_PUBLIC_APP_URL"] = [string]$envValues["NEXT_PUBLIC_APP_URL"]
  $runtimeEnv["GOOGLE_REDIRECT_URI"] = [string]$envValues["GOOGLE_REDIRECT_URI"]

  $runtimeEnvFile = [System.IO.Path]::GetTempFileName()
  try {
    $yamlLines = @($runtimeEnv.GetEnumerator() | Sort-Object Key | ForEach-Object {
      $yamlValue = ConvertTo-Json -InputObject ([string]$_.Value) -Compress
      "$($_.Key): $yamlValue"
    })
    [System.IO.File]::WriteAllLines($runtimeEnvFile, $yamlLines, [System.Text.UTF8Encoding]::new($false))

    Write-Host "Building the production image with Cloud Build (no local Docker installation required)..."
    Invoke-Gcloud @("builds", "submit", "--project=$projectId", "--config=cloudbuild-image.yaml", "--substitutions=$substitutionString", ".")

    $imageUri = "${region}-docker.pkg.dev/${projectId}/${repository}/${imageName}:$($buildSubstitutions['_TAG'])"
    Write-Host "Deploying $service with scale-to-zero and a maximum of $maxInstances instances..."
    $deployArguments = @(
      "run", "deploy", $service,
      "--project=$projectId",
      "--region=$region",
      "--platform=managed",
      "--image=$imageUri",
      "--port=8080",
      "--allow-unauthenticated",
      "--service-account=$runtimeServiceAccount",
      "--cpu=1",
      "--memory=$memory",
      "--concurrency=$concurrency",
      "--timeout=300",
      "--min=0",
      "--max=$maxInstances",
      "--env-vars-file=$runtimeEnvFile",
      "--quiet"
    )
    if ($secretBindings.Count -gt 0) {
      $deployArguments += "--set-secrets=$($secretBindings -join ',')"
    }
    Invoke-Gcloud $deployArguments
  }
  finally {
    Remove-Item -LiteralPath $runtimeEnvFile -Force -ErrorAction SilentlyContinue
  }

  $serviceUri = (& gcloud run services describe $service --project=$projectId --region=$region --format="value(status.url)" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $serviceUri) { throw "Deployment was requested, but the Cloud Run service URL could not be read." }

  $cronSecret = [string]$envValues["CRON_SECRET"]
  $schedulerJobs = @(
    @{ Name = "canvas-booking-sweep"; Schedule = "* * * * *"; Path = "/api/jobs/sweep" },
    @{ Name = "canvas-vault-upload-cleanup"; Schedule = "*/15 * * * *"; Path = "/api/jobs/vault-upload-cleanup" },
    @{ Name = "canvas-live-chat-retention"; Schedule = "17 3 * * *"; Path = "/api/jobs/live-chat-retention" }
  )
  foreach ($job in $schedulerJobs) {
    & gcloud scheduler jobs describe $job.Name --project=$projectId --location=$region *> $null
    $jobExists = ($LASTEXITCODE -eq 0)
    $mode = if ($jobExists) { "update" } else { "create" }
    $schedulerArguments = @(
      "scheduler", "jobs", $mode, "http", $job.Name,
      "--project=$projectId",
      "--location=$region",
      "--schedule=$($job.Schedule)",
      "--time-zone=UTC",
      "--uri=$serviceUri$($job.Path)",
      "--http-method=GET",
      "--update-headers=Authorization=Bearer $cronSecret",
      "--attempt-deadline=320s",
      "--max-retry-attempts=3",
      "--quiet"
    )
    Invoke-Gcloud $schedulerArguments
  }

  Write-Host ""
  Write-Host "Cloud Run deployment completed."
  Write-Host "Service URL: $serviceUri"
  Write-Host "Configured: Secret Manager, Artifact Registry, scale-to-zero autoscaling, and three Cloud Scheduler jobs."
  Write-Host "Before production traffic, verify DNS/custom domain, Google OAuth and Razorpay callback URLs, /api/health, and critical user journeys."
}
finally {
  Pop-Location
}
