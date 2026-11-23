# Created by Caleb M. Irvine for use by Moto Reloaded
<#
.SYNOPSIS
    Idempotent Azure Container Apps + GHCR + GitHub Actions Secrets bootstrap script
    for the Moto Reloaded Gear Intake Checker (Option A — $0/month idle on Azure for Students).

.DESCRIPTION
    Provisions or updates:
      - Azure Container Apps Environment (cae-motoreloaded-rl01, --logs-destination none)
      - Azure Container App (ca-motoreloaded-intake, 1 vCPU / 2 GiB, min=0, max=1, HTTPS)
      - Credit-protection env vars (SCORE_MODE=demo_with_passcode, gpt-4.1-mini, hourly/daily caps)
      - Azure Container App Secrets (azure-openai-api-key, live-score-passcode, ghcr-token)
    Never prints secrets or commits confidential files.
#>

param(
    [string]$ResourceGroup = "rg-motoreloaded",
    [string]$Location = "eastus2",
    [string]$EnvName = "cae-motoreloaded-rl01",
    [string]$AppName = "ca-motoreloaded-intake",
    [string]$Image = "ghcr.io/calebmirvine/moto-reloaded-intake:latest",
    [string]$VisionDeployment = "gpt-4.1-mini",
    [string]$LivePasscode = "",
    [switch]$ConfigureGitHubSecrets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-DotEnv {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $idx = $line.IndexOf("=")
            $k = $line.Substring(0, $idx).Trim()
            $v = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
            $map[$k] = $v
        }
    }
    return $map
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$dotenv = Read-DotEnv (Join-Path $repoRoot ".env")

$aoaiEndpoint = if ($env:AZURE_OPENAI_ENDPOINT) { $env:AZURE_OPENAI_ENDPOINT } else { $dotenv["AZURE_OPENAI_ENDPOINT"] }
$aoaiKey = if ($env:AZURE_OPENAI_API_KEY) { $env:AZURE_OPENAI_API_KEY } else { $dotenv["AZURE_OPENAI_API_KEY"] }
$aoaiVersion = if ($env:AZURE_OPENAI_API_VERSION) { $env:AZURE_OPENAI_API_VERSION } elseif ($dotenv["AZURE_OPENAI_API_VERSION"]) { $dotenv["AZURE_OPENAI_API_VERSION"] } else { "2024-12-01-preview" }

if (-not $aoaiEndpoint -or -not $aoaiKey) {
    throw "Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY in environment or .env."
}

if (-not $LivePasscode) {
    $bytes = New-Object byte[] 12
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $LivePasscode = "moto-" + ([BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant().Substring(0, 12))
    Write-Host "Generated LIVE_SCORE_PASSCODE (store this privately; not committed to git): $LivePasscode" -ForegroundColor Yellow
}

Write-Host "1/4 Ensuring Azure CLI containerapp extension and Microsoft.App provider..." -ForegroundColor Cyan
az extension add --name containerapp --upgrade -y | Out-Null
$regState = az provider show -n Microsoft.App --query "registrationState" -o tsv
if ($regState -ne "Registered") {
    az provider register -n Microsoft.App --wait | Out-Null
}

Write-Host "2/4 Ensuring Container Apps Environment '$EnvName' in '$ResourceGroup' ($Location)..." -ForegroundColor Cyan
$envExists = az containerapp env list -g $ResourceGroup --query "[?name=='$EnvName'].name" -o tsv
if (-not $envExists) {
    az containerapp env create `
        --name $EnvName `
        --resource-group $ResourceGroup `
        --location $Location `
        --logs-destination none | Out-Null
}

Write-Host "3/4 Provisioning/updating Container App '$AppName'..." -ForegroundColor Cyan
$appExists = az containerapp list -g $ResourceGroup --query "[?name=='$AppName'].name" -o tsv

$ghToken = ""
if (Get-Command gh -ErrorAction SilentlyContinue) {
    $ghToken = (gh auth token 2>$null).Trim()
}

if (-not $appExists) {
    $createArgs = @(
        "containerapp", "create",
        "--name", $AppName,
        "--resource-group", $ResourceGroup,
        "--environment", $EnvName,
        "--image", $Image,
        "--target-port", "8000",
        "--ingress", "external",
        "--cpu", "1.0",
        "--memory", "2.0Gi",
        "--min-replicas", "0",
        "--max-replicas", "1",
        "--secrets",
            "azure-openai-api-key=$aoaiKey",
            "live-score-passcode=$LivePasscode",
        "--env-vars",
            "AZURE_OPENAI_ENDPOINT=$aoaiEndpoint",
            "AZURE_OPENAI_API_KEY=secretref:azure-openai-api-key",
            "AZURE_OPENAI_API_VERSION=$aoaiVersion",
            "AZURE_OPENAI_VISION_DEPLOYMENT=$VisionDeployment",
            "SCORE_MODE=demo_with_passcode",
            "LIVE_SCORE_PASSCODE=secretref:live-score-passcode",
            "MAX_LIVE_SCORES_PER_HOUR=10",
            "MAX_LIVE_SCORES_PER_DAY=30",
            "ALLOW_PUBLIC_ADMIN_WRITE=false"
    )
    if ($ghToken -and $Image.StartsWith("ghcr.io/")) {
        $ghUser = (gh api user --jq ".login").Trim()
        $createArgs += @("--registry-server", "ghcr.io", "--registry-username", $ghUser, "--registry-password", $ghToken)
    }
    az @createArgs | Out-Null
} else {
    az containerapp secret set `
        --name $AppName `
        --resource-group $ResourceGroup `
        --secrets "azure-openai-api-key=$aoaiKey" "live-score-passcode=$LivePasscode" | Out-Null
    az containerapp update `
        --name $AppName `
        --resource-group $ResourceGroup `
        --image $Image `
        --cpu 1.0 `
        --memory 2.0Gi `
        --min-replicas 0 `
        --max-replicas 1 `
        --set-env-vars `
            "AZURE_OPENAI_ENDPOINT=$aoaiEndpoint" `
            "AZURE_OPENAI_API_KEY=secretref:azure-openai-api-key" `
            "AZURE_OPENAI_API_VERSION=$aoaiVersion" `
            "AZURE_OPENAI_VISION_DEPLOYMENT=$VisionDeployment" `
            "SCORE_MODE=demo_with_passcode" `
            "LIVE_SCORE_PASSCODE=secretref:live-score-passcode" `
            "MAX_LIVE_SCORES_PER_HOUR=10" `
            "MAX_LIVE_SCORES_PER_DAY=30" `
            "ALLOW_PUBLIC_ADMIN_WRITE=false" | Out-Null
}

$fqdn = (az containerapp show --name $AppName --resource-group $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv).Trim()
Write-Host "4/4 Live Azure Container App URL: https://$fqdn" -ForegroundColor Green

if ($ConfigureGitHubSecrets) {
    gh variable set AZURE_RESOURCE_GROUP --body $ResourceGroup
    gh variable set AZURE_CONTAINER_APP_NAME --body $AppName
    $subId = (az account show --query "id" -o tsv).Trim()
    try {
        $spJson = az ad sp create-for-rbac `
            --name "sp-motoreloaded-gha-deploy" `
            --role Contributor `
            --scopes "/subscriptions/$subId/resourceGroups/$ResourceGroup" `
            --sdk-auth 2>&1
        if ($LASTEXITCODE -eq 0 -and $spJson) {
            $spJson | gh secret set AZURE_CREDENTIALS
            Write-Host "GitHub Actions AZURE_CREDENTIALS secret and variables configured cleanly." -ForegroundColor Green
        } else {
            Write-Warning "Skipping AZURE_CREDENTIALS secret (directory restricted Service Principal creation). GitHub Actions will still test & push images to GHCR; run scripts/deploy_azure.ps1 to roll out new images."
        }
    } catch {
        Write-Warning "Skipping AZURE_CREDENTIALS secret: $_"
    }
}
