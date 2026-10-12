# Build web tĩnh và đẩy lên VPS.
# Dùng: .\deploy\deploy.ps1 -Key C:\duong\dan\ssh-key.key
param(
    [Parameter(Mandatory = $true)][string]$Key,
    [string]$Server = "ubuntu@146.235.22.130",
    [string]$AppUrl = "https://146-235-22-130.sslip.io"
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$env:NEXT_PUBLIC_APP_URL = $AppUrl
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build lỗi" }

$archive = Join-Path $env:TEMP "badrally-web.tgz"
tar -czf $archive -C out .

scp -i $Key $archive "${Server}:/tmp/badrally-web.tgz"
ssh -i $Key $Server "rm -rf /var/www/badrally/* && tar -xzf /tmp/badrally-web.tgz -C /var/www/badrally && rm /tmp/badrally-web.tgz"

Write-Host "Đã deploy: $AppUrl"
