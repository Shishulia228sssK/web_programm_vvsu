$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:COOKIE_SECURE = 'true'
$env:COOKIE_SAMESITE = 'None'
Write-Host 'ЛУДКА.COM: запуск для HTTPS-туннеля. Откройте второй PowerShell для cloudflared.'
node server.js
exit $LASTEXITCODE
