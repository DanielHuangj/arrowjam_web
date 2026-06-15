# Smoke test: manifest, level JSON, static assets (no 404)
# Usage: .\deploy\smoke-test.ps1 [-BaseUrl http://127.0.0.1:5173]
param(
    [string]$BaseUrl = "http://127.0.0.1:5173"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

$paths = @(
    "/",
    "/levels/manifest.json",
    "/levels/level-29.json",
    "/levels/level-30.json",
    "/levels/level-61.json"
)

$failed = 0
foreach ($p in $paths) {
    $url = "$BaseUrl$p"
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -Method Head
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) {
            Write-Host "OK $url"
        } else {
            Write-Host "FAIL $url -> $($r.StatusCode)"
            $failed++
        }
    } catch {
        Write-Host "FAIL $url -> $($_.Exception.Message)"
        $failed++
    }
}

try {
    $html = (Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing).Content
    if ($html -match 'src="(/assets/[^"]+)"') {
        $asset = $matches[1]
        $r = Invoke-WebRequest -Uri "$BaseUrl$asset" -UseBasicParsing -Method Head
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) {
            Write-Host "OK $BaseUrl$asset"
        } else {
            Write-Host "FAIL $BaseUrl$asset"
            $failed++
        }
    }
} catch {
    Write-Host "WARN assets check: $($_.Exception.Message)"
}

if ($failed -gt 0) {
    throw "Smoke test failed: $failed request(s)"
}
Write-Host "Smoke test passed."
