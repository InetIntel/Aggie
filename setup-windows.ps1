[CmdletBinding()]
param(
    [ValidateSet("Docker", "External")]
    [string]$MongoMode = "Docker",
    [string]$EnvFile,
    [switch]$ForceEnvironment,
    [switch]$SkipBuild,
    [switch]$SkipBrowserInstall,
    [switch]$StartDevelopment
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvPath = Join-Path $RepoRoot ".env"
$MongoContainer = "aggie-mongodb"
$MongoVolume = "aggie-mongodb-data"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Assert-LastExitCode([string]$Action) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed with exit code $LASTEXITCODE."
    }
}

function Install-WingetPackage([string]$Id, [string]$CommandName) {
    if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
        Write-Host "$CommandName is already installed."
        return
    }

    Write-Step "Installing $Id"
    & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
    Assert-LastExitCode "Installing $Id"
    Refresh-Path
}

function New-RandomHex([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function New-LocalEnvironment {
    $adminPassword = New-RandomHex 16
    $values = [ordered]@{
        ENVIRONMENT = "development"
        DATABASE_URL = "mongodb://127.0.0.1:27017"
        DATABASE_NAME = "aggie"
        ADMIN_EMAIL = "admin@localhost"
        ADMIN_USERNAME = "admin"
        ADMIN_PASSWORD = $adminPassword
        ADMIN_PARTY = "false"
        SECRET = New-RandomHex 32
        JWT_SESSION = "true"
        RP_ID = "localhost"
        RP_NAME = "Aggie Local"
        ORIGIN = "http://localhost:8000"
        APP_BASE_PATH = ""
        MFA_REQUIRE_FOR_ENROLLED = "false"
        ENCRYPTION_KEY = New-RandomHex 32
        API_REQUEST_TIMEOUT = "60000"
        API_FETCH_INTERVAL = "300000"
        SOCKET_FRONTEND_PORT = "37778"
        PUBLIC_URL = "http://localhost:8000"
    }

    $lines = $values.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
    [IO.File]::WriteAllLines($EnvPath, $lines, (New-Object Text.UTF8Encoding($false)))
    Write-Warning "A local admin account will be created with username 'admin'."
    Write-Host "Generated local admin password: $adminPassword" -ForegroundColor Yellow
    Write-Host "Store this password securely. It is also saved in .env."
}

function Test-Environment {
    $required = @(
        "DATABASE_URL", "DATABASE_NAME", "ADMIN_EMAIL", "ADMIN_USERNAME",
        "ADMIN_PASSWORD", "SECRET", "JWT_SESSION", "RP_ID", "RP_NAME",
        "ORIGIN", "MFA_REQUIRE_FOR_ENROLLED", "ENCRYPTION_KEY",
        "API_REQUEST_TIMEOUT", "API_FETCH_INTERVAL", "SOCKET_FRONTEND_PORT",
        "PUBLIC_URL"
    )
    $values = @{}
    Get-Content $EnvPath | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
            $values[$Matches[1].Trim()] = $Matches[2].Split('#')[0].Trim()
        }
    }
    $missing = @($required | Where-Object {
        -not $values.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($values[$_])
    })
    if ($missing.Count -gt 0) {
        throw "The .env file is missing values for: $($missing -join ', ')."
    }
}

function Wait-ForDocker([int]$Attempts = 36) {
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        & docker info *> $null
        if ($LASTEXITCODE -eq 0) { return $true }
        Start-Sleep -Seconds 5
    }
    return $false
}

function Wait-ForMongo([int]$Attempts = 36) {
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $result = & docker exec $MongoContainer mongosh --quiet --eval "db.runCommand({ ping: 1 }).ok" 2>$null
        if ($LASTEXITCODE -eq 0 -and $result -contains "1") { return $true }
        Start-Sleep -Seconds 5
    }
    return $false
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "This script supports Windows only."
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator, then rerun this script."
}

Set-Location $RepoRoot
if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
    throw "Run this script from the root of the Aggie repository."
}
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is required. Install Microsoft App Installer, then rerun this script."
}
if (Test-Path (Join-Path $RepoRoot ".gitignore")) {
    $envIgnored = Select-String -Path (Join-Path $RepoRoot ".gitignore") -Pattern '^\.env(?:\*|$)' -Quiet
    if (-not $envIgnored) {
        Write-Warning ".env is not explicitly ignored by Git. Do not commit generated credentials."
    }
}

Write-Step "Installing host prerequisites"
Install-WingetPackage "Git.Git" "git"
Install-WingetPackage "Schniz.fnm" "fnm"
Install-WingetPackage "Docker.DockerDesktop" "docker"

Write-Step "Installing Node.js 22.14.0 and npm"
Invoke-Expression (& fnm env --shell powershell | Out-String)
& fnm install 22.14.0
Assert-LastExitCode "Installing Node.js"
& fnm use 22.14.0
Assert-LastExitCode "Selecting Node.js"
& node --version
& npm --version

Write-Step "Enabling WSL2 prerequisites for Docker Desktop"
$restartRequired = $false
foreach ($featureName in @("Microsoft-Windows-Subsystem-Linux", "VirtualMachinePlatform")) {
    $feature = Get-WindowsOptionalFeature -Online -FeatureName $featureName
    if ($feature.State -ne "Enabled") {
        $result = Enable-WindowsOptionalFeature -Online -FeatureName $featureName -All -NoRestart
        if ($result.RestartNeeded) { $restartRequired = $true }
    }
}
if ($restartRequired) {
    Write-Warning "Windows enabled WSL2 prerequisites and requires a reboot. Reboot, then run this same script again."
    exit 3010
}

Write-Step "Starting Docker Desktop"
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktop) {
        Start-Process $dockerDesktop
    }
}
if (-not (Wait-ForDocker)) {
    throw "Docker Desktop did not become ready. If Windows requested a WSL2 update or reboot, complete it and rerun this script."
}

if ($MongoMode -eq "Docker") {
    Write-Step "Provisioning MongoDB 7 in Docker"
    $escapedContainer = [regex]::Escape($MongoContainer)
    $existingContainer = & docker ps -a --filter "name=^/$escapedContainer$" --format "{{.Names}}"
    if ($existingContainer -eq $MongoContainer) {
        & docker start $MongoContainer | Out-Null
        Assert-LastExitCode "Starting MongoDB container"
    } else {
        & docker run --detach --name $MongoContainer --restart unless-stopped `
            --publish 127.0.0.1:27017:27017 --volume "${MongoVolume}:/data/db" mongo:7 | Out-Null
        Assert-LastExitCode "Creating MongoDB container"
    }
    if (-not (Wait-ForMongo)) {
        throw "MongoDB did not become ready. Check 'docker logs $MongoContainer', then rerun this script."
    }
}

Write-Step "Configuring environment"
if ($EnvFile) {
    $resolvedEnvFile = (Resolve-Path $EnvFile).Path
    if ((Test-Path $EnvPath) -and -not $ForceEnvironment) {
        Write-Host ".env already exists; preserving it. Use -ForceEnvironment to replace it."
    } else {
        Copy-Item $resolvedEnvFile $EnvPath -Force
        Write-Host "Copied environment configuration without displaying secrets."
    }
} elseif (-not (Test-Path $EnvPath)) {
    if ($MongoMode -eq "External") {
        throw "External MongoDB mode requires -EnvFile or an existing .env file."
    }
    New-LocalEnvironment
} else {
    Write-Host ".env already exists; preserving it."
}
Test-Environment

Write-Step "Installing project dependencies"
& npm.cmd ci
Assert-LastExitCode "npm ci"

if (-not $SkipBrowserInstall) {
    Write-Step "Installing Playwright Chromium"
    & npx.cmd playwright install chromium
    Assert-LastExitCode "Installing Playwright Chromium"
}

Write-Step "Running OONI tests"
& npm.cmd run test:ooni
Assert-LastExitCode "OONI tests"

if (-not $SkipBuild) {
    Write-Step "Building the frontend"
    & npm.cmd run build
    Assert-LastExitCode "Frontend build"
}

Write-Step "Checking development ports"
foreach ($port in @(3000, 8000, 37778)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        Write-Warning "Port $port is already in use."
    }
}

if ($StartDevelopment) {
    Write-Step "Starting frontend and backend in separate PowerShell windows"
    Start-Process powershell -WorkingDirectory $RepoRoot -ArgumentList "-NoExit", "-Command", "fnm use 22.14.0; npm.cmd run dev:backend"
    Start-Process powershell -WorkingDirectory $RepoRoot -ArgumentList "-NoExit", "-Command", "fnm use 22.14.0; npm.cmd run dev:frontend"
}

Write-Host "`nAggie setup completed." -ForegroundColor Green
Write-Host "Backend: npm run dev:backend"
Write-Host "Frontend: npm run dev:frontend"
Write-Host "Open: http://localhost:8000"
