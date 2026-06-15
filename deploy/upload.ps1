# Upload code/client/dist/ to VPS
# Usage: .\deploy\upload.ps1
# Requires deploy/deploy.env (see env.example)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $PSScriptRoot "deploy.env"

if (-not (Test-Path $EnvFile)) {
    throw "Missing deploy/deploy.env. Copy deploy/env.example and set DEPLOY_HOST, DEPLOY_PATH."
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

$Host_ = $env:DEPLOY_HOST
$Path = if ($env:DEPLOY_PATH) { $env:DEPLOY_PATH } else { "/var/www/arrowjam" }
$Dist = Join-Path $Root "code\client\dist"

if (-not (Test-Path (Join-Path $Dist "index.html"))) {
    throw "dist/ not found. Run: cd code/client && npm run build"
}

Write-Host "Uploading $Dist -> ${Host_}:${Path}/"

ssh $Host_ "sudo mkdir -p '$Path' && sudo chown -R `$USER:`$USER '$Path'"

if (Get-Command rsync -ErrorAction SilentlyContinue) {
    rsync -avz --delete "$Dist/" "${Host_}:${Path}/"
} else {
    scp -r "$Dist\*" "${Host_}:${Path}/"
}

ssh $Host_ "sudo chown -R www-data:www-data '$Path' 2>/dev/null || sudo chown -R nginx:nginx '$Path' 2>/dev/null || true"

Write-Host "Upload done."
