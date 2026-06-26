# 关卡编辑器外网一键更新：构建 -> 上传 -> 冒烟测试
# 用法:
#   .\deploy\update-editor.ps1
#   .\deploy\update-editor.ps1 -SkipBuild
#   .\deploy\update-editor.ps1 -SkipSmokeTest
#
# 服务器 SSH 地址与游戏相同（deploy.env 中 DEPLOY_HOST）；
# 编辑器部署目录默认 /data/yunwei/arroweditor（可用 EDITOR_DEPLOY_PATH 覆盖）。

param(
    [switch]$SkipBuild,
    [switch]$SkipSmokeTest
)

$ErrorActionPreference = "Stop"
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $DeployDir
$EditorDir = Join-Path $RepoRoot "code\editor"

if (-not $SkipBuild) {
    Write-Host "=== 构建编辑器 (code/editor) ==="
    Push-Location $EditorDir
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "npm install..."
            npm install
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        npm run build
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
    Write-Host "构建完成."
} else {
    Write-Host "跳过构建 (-SkipBuild)"
}

Write-Host "=== 上传到服务器 ==="
& (Join-Path $DeployDir "upload-editor.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipSmokeTest) {
    Write-Host "=== 编辑器冒烟测试 ==="
    & (Join-Path $DeployDir "smoke-test-editor.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Host "跳过冒烟测试 (-SkipSmokeTest)"
}

Write-Host "编辑器更新完成."
