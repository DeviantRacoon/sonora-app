# Script para descargar todos los binarios necesarios en ./bin
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\.."
$binDir = Join-Path $root "bin"

if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
}

Write-Host "Verificando binarios en $binDir..." -ForegroundColor Cyan

# 1. cloudflared
$cloudflaredPath = Join-Path $binDir "cloudflared.exe"
if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "Descargando cloudflared.exe..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflaredPath
    Write-Host "✓ cloudflared.exe descargado." -ForegroundColor Green
} else {
    Write-Host "✓ cloudflared.exe ya existe." -ForegroundColor Green
}

# 2. yt-dlp
$ytdlpPath = Join-Path $binDir "yt-dlp.exe"
if (-not (Test-Path $ytdlpPath)) {
    Write-Host "Descargando yt-dlp.exe..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile $ytdlpPath
    Write-Host "✓ yt-dlp.exe descargado." -ForegroundColor Green
} else {
    Write-Host "✓ yt-dlp.exe ya existe." -ForegroundColor Green
}

# 3. ffmpeg
$ffmpegPath = Join-Path $binDir "ffmpeg.exe"
if (-not (Test-Path $ffmpegPath)) {
    Write-Host "Descargando ffmpeg..." -ForegroundColor Yellow
    $zipPath = Join-Path $env:TEMP "ffmpeg.zip"
    $tempExtract = Join-Path $env:TEMP "ffmpeg-extract"
    try {
        Invoke-WebRequest -Uri "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" -OutFile $zipPath
        Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force
        $extractedFfmpeg = Get-ChildItem -Path $tempExtract -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
        $extractedFfprobe = Get-ChildItem -Path $tempExtract -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
        if ($extractedFfmpeg) {
            Copy-Item -Path $extractedFfmpeg.FullName -Destination $ffmpegPath -Force
        }
        if ($extractedFfprobe) {
            Copy-Item -Path $extractedFfprobe.FullName -Destination (Join-Path $binDir "ffprobe.exe") -Force
        }
        Write-Host "✓ ffmpeg.exe y ffprobe.exe descargados." -ForegroundColor Green
    } finally {
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "✓ ffmpeg.exe ya existe." -ForegroundColor Green
}

Write-Host "`nResumen de binarios instalados en bin/:" -ForegroundColor Cyan
Get-ChildItem -Path $binDir -Filter "*.exe" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
