# Chạy PocketBase LOCAL để phát triển/thử (không đụng server thật).
# Dùng: .\scripts\local-pb.ps1   → http://127.0.0.1:8090 (dữ liệu ở .local/pb_data, migrations + hooks lấy từ repo)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root ".local\pocketbase"
$exe = Join-Path $dir "pocketbase.exe"
$version = "0.40.5"

if (-not (Test-Path $exe)) {
    New-Item -ItemType Directory -Force $dir | Out-Null
    $zip = Join-Path $dir "pb.zip"
    $url = "https://github.com/pocketbase/pocketbase/releases/download/v$version/pocketbase_${version}_windows_amd64.zip"
    Write-Host "Tải PocketBase $version..."
    Invoke-WebRequest -Uri $url -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $dir -Force
    Remove-Item $zip
}

$data = Join-Path $root ".local\pb_data"
$migrations = Join-Path $root "pocketbase\pb_migrations"
$hooks = Join-Path $root "pocketbase\pb_hooks"
& $exe serve --http=127.0.0.1:8090 "--dir=$data" "--migrationsDir=$migrations" "--hooksDir=$hooks"
