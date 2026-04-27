param(
  [Parameter(Mandatory = $true)]
  [string]$RailwayApiToken,

  [string]$ProjectName = "ipipd-panel",
  [string]$ServiceName = "ipipd-panel",
  [string]$AppSecret = "",
  [string]$AdminUser = "admin",
  [string]$AdminPassword = "",
  [string]$CorsOrigin = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$railway = Join-Path $root ".railway-cli\railway.exe"
if (!(Test-Path $railway)) {
  throw "Railway CLI not found at $railway. Run the setup in RAILWAY部署说明.md first."
}

if (!$AppSecret) {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }
  $AppSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

if (!$AdminPassword) {
  $bytes = New-Object byte[] 12
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }
  $AdminPassword = [Convert]::ToBase64String($bytes).TrimEnd("=")
}

$env:RAILWAY_API_TOKEN = $RailwayApiToken

Push-Location $root
try {
  & $railway init --name $ProjectName
  & $railway add --service $ServiceName
  & $railway variable set `
    "APP_SECRET=$AppSecret" `
    "ADMIN_USER=$AdminUser" `
    "ADMIN_PASSWORD=$AdminPassword" `
    "TZ=Asia/Shanghai" `
    --service $ServiceName `
    --skip-deploys

  if ($CorsOrigin) {
    & $railway variable set "CORS_ORIGIN=$CorsOrigin" --service $ServiceName --skip-deploys
  }

  & $railway volume add --mount-path /app/data --service $ServiceName
  & $railway up --service $ServiceName --detach --message "Deploy IPIPD panel"
  & $railway domain --service $ServiceName --port 3000
  & $railway status

  Write-Host ""
  Write-Host "Railway deploy requested."
  Write-Host "Admin user: $AdminUser"
  Write-Host "Admin password: $AdminPassword"
  Write-Host "Open the generated Railway domain and check /api/health."
}
finally {
  Pop-Location
  Remove-Item Env:RAILWAY_API_TOKEN -ErrorAction SilentlyContinue
}
