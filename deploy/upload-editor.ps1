# 将 code/editor/dist 同步到远程编辑器目录（默认 /data/yunwei/arroweditor）
# 用法: .\deploy\upload-editor.ps1
# 依赖: deploy/deploy.env（DEPLOY_HOST、可选 EDITOR_DEPLOY_PATH）

$ErrorActionPreference = "Stop"
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $DeployDir
$EnvFile = Join-Path $DeployDir "deploy.env"
$Dist = Join-Path $RepoRoot "code\editor\dist"

if (-not (Test-Path $EnvFile)) {
    Write-Error "缺少 deploy/deploy.env，请复制 deploy/env.example 为 deploy/deploy.env 并填写 DEPLOY_HOST"
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"').Trim("'")
        Set-Item -Path "env:$name" -Value $value
    }
}

$Host_ = $env:DEPLOY_HOST
if (-not $Host_) {
    Write-Error "deploy.env 中未设置 DEPLOY_HOST"
}

$RemotePath = if ($env:EDITOR_DEPLOY_PATH) { $env:EDITOR_DEPLOY_PATH } else { "/data/yunwei/arroweditor" }

if (-not (Test-Path $Dist)) {
    Write-Error "未找到构建产物 $Dist，请先执行: cd code/editor && npm run build"
}

Write-Host "上传 $Dist -> ${Host_}:${RemotePath}/"

$rsync = Get-Command rsync -ErrorAction SilentlyContinue
if ($rsync) {
    & rsync -avz --delete `
        -e "ssh" `
        "$Dist/" `
        "${Host_}:${RemotePath}/"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Host "未找到 rsync，使用 scp（不删除远程多余文件）"
    & ssh $Host_ "mkdir -p $RemotePath"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & scp -r "$Dist\*" "${Host_}:${RemotePath}/"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "上传完成."
