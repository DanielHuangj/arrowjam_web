# 日常更新：本地打包并上传到外网服务器应用目录
# 用法: .\deploy\update.ps1
#       .\deploy\update.ps1 -IncludeLevels    # 同时上传关卡（默认跳过，关卡多上传较慢）
#       .\deploy\update.ps1 -SkipBuild        # 跳过构建，仅上传已有 dist/
#       .\deploy\update.ps1 -SkipSmokeTest    # 上传后不做远程验收
#
# 首次使用前：
#   1. 复制 deploy/env.example 为 deploy/deploy.env
#   2. 填写 DEPLOY_HOST（如 root@1.2.3.4）和 DEPLOY_PATH（默认 /data/yunwei/arrawjam）

param(
    [switch]$IncludeLevels,
    [switch]$SkipBuild,
    [switch]$SkipSmokeTest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $PSScriptRoot "deploy.env"
$ClientDir = Join-Path $Root "code\client"
$Dist = Join-Path $ClientDir "dist"

if (-not (Test-Path $EnvFile)) {
    throw @"
缺少 deploy/deploy.env。
请复制 deploy/env.example 为 deploy/deploy.env，并填写：
  DEPLOY_HOST=root@你的服务器IP
  DEPLOY_PATH=/data/yunwei/arrawjam
  SITE_URL=http://arrowjam.farfieldgames.com:18080
"@
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

if (-not $env:DEPLOY_HOST) {
    throw "deploy.env 中未设置 DEPLOY_HOST"
}

$DeployPath = if ($env:DEPLOY_PATH) { $env:DEPLOY_PATH } else { "/data/yunwei/arrawjam" }

if (-not $SkipBuild) {
    Write-Host "== 1/3 本地构建 =="
    Push-Location $ClientDir
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "首次构建，正在 npm install ..."
            npm install
        }
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build 失败 (exit $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "== 1/3 跳过构建 =="
}

if (-not (Test-Path (Join-Path $Dist "index.html"))) {
    throw "未找到 $Dist/index.html，请先执行 npm run build"
}

Write-Host "== 2/3 上传到 ${env:DEPLOY_HOST}:${DeployPath}/ =="
$uploadArgs = @{}
if ($IncludeLevels) {
    $uploadArgs.IncludeLevels = $true
}
& (Join-Path $PSScriptRoot "upload.ps1") @uploadArgs

if (-not $SkipSmokeTest) {
    $SiteUrl = $env:SITE_URL
    if ($SiteUrl) {
        $BaseUrl = $SiteUrl.TrimEnd("/")
    } else {
        $Domain = $env:DOMAIN
        if ($Domain -and $Domain -ne "your-domain.com") {
            $BaseUrl = "https://$Domain"
        } else {
            $BaseUrl = "http://$($env:DEPLOY_HOST.Split('@')[-1])"
        }
    }
    Write-Host "== 3/3 远程验收 $BaseUrl =="
    & (Join-Path $PSScriptRoot "smoke-test.ps1") -BaseUrl $BaseUrl
} else {
    Write-Host "== 3/3 跳过远程验收 =="
}

Write-Host ""
Write-Host "更新完成。应用目录: ${env:DEPLOY_HOST}:${DeployPath}"
