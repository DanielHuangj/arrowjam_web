# 编辑器外网 HTTP 冒烟测试
# 用法: .\deploy\smoke-test-editor.ps1
# 依赖: deploy/deploy.env 中 EDITOR_SITE_URL（未设置则跳过）

$ErrorActionPreference = "Stop"
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $DeployDir "deploy.env"

if (-not (Test-Path $EnvFile)) {
    Write-Error "缺少 deploy/deploy.env"
}

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"').Trim("'")
        Set-Item -Path "env:$name" -Value $value
    }
}

$Base = $env:EDITOR_SITE_URL
if (-not $Base) {
    Write-Warning "未设置 EDITOR_SITE_URL，跳过编辑器冒烟测试"
    exit 0
}

$Base = $Base.TrimEnd("/")

function Test-Url {
    param([string]$Path, [string]$Label)
    $url = "$Base$Path"
    try {
        $resp = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 15
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
            Write-Host "[OK] $Label ($url)"
            return $true
        }
        Write-Host "[FAIL] $Label ($url) -> HTTP $($resp.StatusCode)"
        return $false
    } catch {
        Write-Host "[FAIL] $Label ($url) -> $($_.Exception.Message)"
        return $false
    }
}

Write-Host "编辑器冒烟测试: $Base"
$ok = $true
$ok = (Test-Url "/" "首页") -and $ok

# 尝试从 index.html 解析首个 assets 资源
$indexUrl = "$Base/"
try {
    $html = (Invoke-WebRequest -Uri $indexUrl -UseBasicParsing -TimeoutSec 15).Content
    if ($html -match 'src="(/assets/[^"]+)"') {
        $assetPath = $matches[1]
        $ok = (Test-Url $assetPath "静态资源 $assetPath") -and $ok
    } else {
        Write-Warning "index.html 中未找到 /assets/ 引用，跳过资源检查"
    }
} catch {
    Write-Warning "无法拉取 index.html 做资源检查: $($_.Exception.Message)"
}

if (-not $ok) {
    Write-Error "编辑器冒烟测试未通过"
}
Write-Host "编辑器冒烟测试通过."
