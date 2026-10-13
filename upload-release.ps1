param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$repo = "lexconsiliumconsultores/lex"
$distDir = "dist_instalador"

Write-Host "Uploading v$Version to GitHub release..." -ForegroundColor Cyan

$token = (gh auth token 2>$null)
if (-not $token) {
    Write-Error "No GitHub token found. Run: gh auth login"
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/octet-stream"
}

Write-Host "Getting release ID for v$Version..."
$releaseJson = gh release view "v$Version" --repo $repo --json id --jq '.id' 2>$null
if (-not $releaseJson) {
    Write-Error "Release v$Version not found. Create it first."
    exit 1
}
$releaseId = $releaseJson.Trim()
Write-Host "Release ID: $releaseId"

$files = @(
    "latest.yml",
    "lex-setup-$Version.exe",
    "lex-portable-$Version.exe"
)

foreach ($file in $files) {
    $filePath = Join-Path $distDir $file
    if (-not (Test-Path $filePath)) {
        Write-Host "  SKIP $file (not found)" -ForegroundColor Yellow
        continue
    }
    $sizeMB = [math]::Round((Get-Item $filePath).Length / 1MB, 1)
    Write-Host "  Uploading $file ($sizeMB MB)..." -ForegroundColor Green

    $url = "https://uploads.github.com/repos/$repo/releases/$releaseId/assets?name=$file"

    try {
        curl.exe -s -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/octet-stream" --data-binary "@$filePath" --max-time 900 $url | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  OK: $file uploaded" -ForegroundColor Green
        } else {
            Write-Host "  FAILED: $file (exit code $LASTEXITCODE)" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ERROR: $file - $_" -ForegroundColor Red
    }
}

Write-Host "`nVerifying assets..." -ForegroundColor Cyan
gh release view "v$Version" --repo $repo --json assets --jq '.assets[] | "\(.name): \(.size) bytes"'
Write-Host "`nDone! v$Version is live for auto-update." -ForegroundColor Green
