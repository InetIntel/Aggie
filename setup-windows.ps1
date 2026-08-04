[CmdletBinding()]
param(
    [string]$InstallPath = (Join-Path $HOME "source\Aggie"),
    [string]$NpmRegistry = "https://registry.npmjs.org/",
    [string]$HttpsProxy = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Invoke-CommandChecked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$DisplayName
    )

    if ($DryRun) {
        Write-Host "Would install $DisplayName ($Id)."
        return
    }

    Write-Step "Installing $DisplayName"
    Invoke-CommandChecked "winget" @(
        "install", "--id", $Id, "--exact", "--silent",
        "--accept-package-agreements", "--accept-source-agreements"
    )
    Refresh-Path
}

function New-RandomString {
    param([int]$Length = 32)

    $characters = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    $bytes = New-Object byte[] $Length
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }

    return -join ($bytes | ForEach-Object { $characters[$_ % $characters.Length] })
}

function Test-DockerReady {
    & docker info *> $null
    return $LASTEXITCODE -eq 0
}

if ($env:OS -ne "Windows_NT") {
    throw "This bootstrap script supports Windows 10 and Windows 11 only."
}

Write-Step "Checking Windows prerequisites"
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is required. Install 'App Installer' from Microsoft Store, then rerun this script."
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Install-WingetPackage -Id "Git.Git" -DisplayName "Git"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Install-WingetPackage -Id "OpenJS.NodeJS.18" -DisplayName "Node.js 18"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Install-WingetPackage -Id "Docker.DockerDesktop" -DisplayName "Docker Desktop"
}

if ($DryRun) {
    Write-Host "Would clone Aggie when the script is not already inside the repository."
    Write-Host "Would create ignored local configuration when missing."
    Write-Host "Would start MongoDB 6 in Docker and run npm ci."
    Write-Host "Dry run complete. No changes were made." -ForegroundColor Green
    exit 0
}

Refresh-Path

foreach ($command in @("git", "node", "npm", "docker")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command was installed but is not available yet. Restart Windows, then rerun this script."
    }
}

$nodeVersion = (& node --version).TrimStart("v")
$parsedNodeVersion = [Version]$nodeVersion
if ($parsedNodeVersion.Major -ne 18 -or $parsedNodeVersion.Minor -lt 20) {
    throw "Aggie requires Node.js 18.20 or newer within major version 18. Found $nodeVersion."
}

$scriptRepoPath = $PSScriptRoot
if (Test-Path (Join-Path $scriptRepoPath "package.json")) {
    $repoPath = $scriptRepoPath
} else {
    $repoPath = $InstallPath
    if (-not (Test-Path (Join-Path $repoPath "package.json"))) {
        if (Test-Path $repoPath) {
            $existingFiles = @(Get-ChildItem $repoPath -Force)
            if ($existingFiles.Count -gt 0) {
                throw "$repoPath exists and is not an Aggie checkout. Choose another -InstallPath."
            }
        } else {
            New-Item -ItemType Directory -Path (Split-Path $repoPath -Parent) -Force | Out-Null
        }

        Write-Step "Cloning Aggie"
        Invoke-CommandChecked "git" @(
            "clone", "--branch", "develop", "https://github.com/InetIntel/Aggie.git", $repoPath
        )
    }
}

Set-Location $repoPath
Write-Host "Repository: $repoPath"
Write-Host "Node:       $(& node --version)"
Write-Host "npm:        $(& npm --version)"

Write-Step "Starting Docker Desktop"
if (-not (Test-DockerReady)) {
    $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerDesktop)) {
        throw "Docker Desktop is installed but could not be found. Restart Windows, then rerun this script."
    }

    Start-Process $dockerDesktop
    $dockerReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 3
        if (Test-DockerReady) {
            $dockerReady = $true
            break
        }
    }
    if (-not $dockerReady) {
        throw "Docker Desktop did not become ready. Complete any Docker/WSL setup shown on screen, then rerun this script. Docker sign-in is not required."
    }
}

Write-Step "Starting local MongoDB"
$mongoContainer = & docker ps -a --filter "name=^/aggie-mongo$" --format "{{.Names}}"
if ($mongoContainer -eq "aggie-mongo") {
    Invoke-CommandChecked "docker" @("start", "aggie-mongo")
} else {
    Invoke-CommandChecked "docker" @(
        "run", "--detach", "--name", "aggie-mongo", "--restart", "unless-stopped",
        "--publish", "27017:27017", "--volume", "aggie-mongo-data:/data/db", "mongo:6.0"
    )
}

$mongoReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec aggie-mongo mongosh --quiet --eval "db.adminCommand({ ping: 1 }).ok" *> $null
    if ($LASTEXITCODE -eq 0) {
        $mongoReady = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $mongoReady) {
    throw "MongoDB did not become ready. Run 'docker logs aggie-mongo' for details."
}

$createdAdminPassword = $null
if (-not (Test-Path ".env")) {
    Write-Step "Creating local environment configuration"
    $createdAdminPassword = New-RandomString -Length 20
    $appSecret = New-RandomString -Length 48
    @"
ENVIRONMENT=development
DATABASE_URL=mongodb://localhost:27017/
DATABASE_NAME=aggie
REACT_APP_BASE_URL=http://localhost:3000/
REACT_APP_PORT=8000
SENDGRID_API_KEY=
SECRET=$appSecret
ADMIN_PARTY=false
ADMIN_EMAIL=admin@localhost
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$createdAdminPassword
API_REQUEST_TIMEOUT=60000
JWT_SESSION=false
DETECT_HATE_SPEECH=false
"@ | Set-Content ".env" -Encoding ASCII
} else {
    Write-Host "Keeping existing .env file."
}

$secretsPath = "backend\config\secrets.json"
if (-not (Test-Path $secretsPath)) {
    Write-Step "Creating local service configuration"
    $secrets = [ordered]@{
        twitter = [ordered]@{ API_key = ""; API_key_secret = ""; access_token = ""; access_token_secret = "" }
        crowdtangle = [ordered]@{ count = 100; sortParam = "date"; language = "en"; useLanguage = $false; zawgyiProb = 0.9; interval = "1500" }
        comments = [ordered]@{ username = ""; password = ""; baseUrl = ""; pageCount = 100 }
        elmo = [ordered]@{ authToken = "" }
        gplaces = [ordered]@{ key = "" }
        "group map" = [ordered]@{ zoom = "7"; center = "Ghana"; latitude = ""; longitude = "" }
        logger = [ordered]@{
            SES = [ordered]@{ disabled = $true; level = "error"; silent = $false }
            Slack = [ordered]@{ disabled = $true; level = "error" }
            file = [ordered]@{ disabled = $false; level = "warn"; filename = "logs/master.log" }
            console = [ordered]@{ disabled = $false; level = "warn" }
            api = [ordered]@{ log_requests = $true; log_responses = $true; log_user_activity = $false; filename = "logs/api.log" }
            master = [ordered]@{ filename = "logs/master.log" }
            fetching = [ordered]@{ filename = "logs/fetching.log" }
            analytics = [ordered]@{ filename = "logs/analytics.log" }
        }
        api_request_timeout = 60
        fetching = $false
        experiment = $false
        detectHateSpeech = $false
    }
    $secrets | ConvertTo-Json -Depth 8 | Set-Content $secretsPath -Encoding ASCII
} else {
    Write-Host "Keeping existing $secretsPath file."
}

Write-Step "Checking npm registry access"
$env:NPM_CONFIG_REGISTRY = $NpmRegistry
if ($HttpsProxy) {
    $env:HTTPS_PROXY = $HttpsProxy
    $env:NPM_CONFIG_HTTPS_PROXY = $HttpsProxy
}
Invoke-CommandChecked "npm" @(
    "ping", "--registry=$NpmRegistry", "--fetch-timeout=15000", "--fetch-retries=0"
)

Write-Step "Installing Aggie dependencies and initializing the database"
Invoke-CommandChecked "npm" @("ci", "--no-audit", "--no-fund")

Write-Step "Installing the development process runner"
Invoke-CommandChecked "npm" @("install", "--global", "stmux", "--no-audit", "--no-fund")

Write-Step "Validating installation"
Invoke-CommandChecked "npm" @("ls", "--depth=0")
if (-not (Get-Command stmux -ErrorAction SilentlyContinue)) {
    throw "stmux was installed but is not available on PATH. Open a new terminal, then rerun this script."
}
$adminCount = (& docker exec aggie-mongo mongosh aggie --quiet --eval 'db.users.countDocuments({ role: "admin" })').Trim()
if ([int]$adminCount -lt 1) {
    throw "Dependencies installed, but the Aggie admin user was not created."
}

Write-Host "`nAggie setup is complete." -ForegroundColor Green
Write-Host "Repository: $repoPath"
Write-Host "Start it with: npm run dev"
Write-Host "Frontend: http://localhost:8000"
if ($createdAdminPassword) {
    Write-Host "Username: admin"
    Write-Host "Password: $createdAdminPassword"
    Write-Host "The password is also stored in the ignored .env file."
}