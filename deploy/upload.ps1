# Upload code/client/dist/ to VPS
# Usage: .\deploy\upload.ps1
#        .\deploy\upload.ps1 -IncludeLevels   # 同时上传 dist/levels/（关卡较多时较慢）
#        日常更新请用 .\deploy\update.ps1（含 build + 验收）
# Requires deploy/deploy.env (see env.example)

param(
    [switch]$IncludeLevels
)

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
$Path = if ($env:DEPLOY_PATH) { $env:DEPLOY_PATH } else { "/data/yunwei/arrawjam" }
$Dist = Join-Path $Root "code\client\dist"

if (-not (Test-Path (Join-Path $Dist "index.html"))) {
    throw "dist/ not found. Run: cd code/client && npm run build"
}

if ($IncludeLevels) {
    Write-Host "Uploading $Dist -> ${Host_}:${Path}/ (含关卡)"
} else {
    Write-Host "Uploading $Dist -> ${Host_}:${Path}/ (跳过 levels/，加 -IncludeLevels 可上传关卡)"
}

ssh $Host_ "mkdir -p '$Path'"

if (Get-Command rsync -ErrorAction SilentlyContinue) {
    $rsyncArgs = @("-avz", "--delete")
    if (-not $IncludeLevels) {
        $rsyncArgs += "--exclude", "levels/"
    }
    $rsyncArgs += "$Dist/", "${Host_}:${Path}/"
    & rsync @rsyncArgs
} else {
    foreach ($item in Get-ChildItem $Dist) {
        if (-not $IncludeLevels -and $item.Name -eq "levels") {
            continue
        }
        scp -r $item.FullName "${Host_}:${Path}/"
    }
}

Write-Host "Upload done."
