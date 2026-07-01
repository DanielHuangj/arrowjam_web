# Full deploy: build -> upload -> nginx -> (optional) HTTPS -> smoke test
# Usage: .\deploy\deploy.ps1 [-SkipHttps]
param(
    [switch]$SkipHttps
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $PSScriptRoot "deploy.env"

if (-not (Test-Path $EnvFile)) {
    throw @"
Missing deploy/deploy.env.
Copy deploy/env.example to deploy/deploy.env and set:
  DEPLOY_HOST=user@your-server-ip
  DEPLOY_PATH=/var/www/arrowjam
  DOMAIN=your-domain.com
Use -SkipHttps if you have no domain.
"@
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

Write-Host "== 1/5 Local build =="
Push-Location (Join-Path $Root "code\client")
npm run build
Pop-Location

Write-Host "== 2/5 Upload dist =="
& (Join-Path $PSScriptRoot "upload.ps1") -IncludeLevels

$Host_ = $env:DEPLOY_HOST
$Path = $env:DEPLOY_PATH
$Domain = $env:DOMAIN

Write-Host "== 3/5 Configure Nginx =="
scp (Join-Path $PSScriptRoot "setup-server.sh") "${Host_}:/tmp/arrowjam-setup-server.sh"
scp -r (Join-Path $PSScriptRoot "nginx") "${Host_}:/tmp/arrowjam-nginx"
ssh $Host_ "chmod +x /tmp/arrowjam-setup-server.sh && CONF_SRC=/tmp/arrowjam-nginx/arrowjam.conf DEPLOY_PATH='$Path' bash /tmp/arrowjam-setup-server.sh '$Domain'"

if (-not $SkipHttps -and $Domain -and $Domain -ne "your-domain.com") {
    Write-Host "== 4/5 Configure HTTPS =="
    scp (Join-Path $PSScriptRoot "setup-https.sh") "${Host_}:/tmp/arrowjam-setup-https.sh"
    ssh $Host_ "chmod +x /tmp/arrowjam-setup-https.sh && DOMAIN='$Domain' bash /tmp/arrowjam-setup-https.sh"
} else {
    Write-Host "== 4/5 Skip HTTPS (no domain or -SkipHttps) =="
}

$SiteUrl = $env:SITE_URL
$BaseUrl = if ($SiteUrl) {
    $SiteUrl.TrimEnd("/")
} elseif ($Domain -and $Domain -ne "your-domain.com") {
    "https://$Domain"
} else {
    "http://$($Host_.Split('@')[-1])"
}
Write-Host "== 5/5 Remote smoke test $BaseUrl =="
& (Join-Path $PSScriptRoot "smoke-test.ps1") -BaseUrl $BaseUrl

Write-Host "Deploy complete: $BaseUrl"
