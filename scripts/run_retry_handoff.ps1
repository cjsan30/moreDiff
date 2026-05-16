param(
    [switch]$Ephemeral,
    [string]$Model,
    [switch]$DryRun,
    [switch]$PreflightOnly,
    [string]$PromptId
)

$ErrorActionPreference = "Stop"

$preflightScript = Join-Path $PSScriptRoot "run_harness_preflight.ps1"
$generateScript = Join-Path $PSScriptRoot "generate_retry_prompt.ps1"
$dispatchScript = Join-Path $PSScriptRoot "dispatch_retry_prompt.ps1"

& powershell -ExecutionPolicy Bypass -File $preflightScript
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& powershell -ExecutionPolicy Bypass -File $generateScript
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$dispatchArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $dispatchScript,
    "-InvokeCodex"
)
if ($Ephemeral) {
    $dispatchArgs += "-Ephemeral"
}
if (-not [string]::IsNullOrWhiteSpace($Model)) {
    $dispatchArgs += @("-Model", $Model)
}
if ($DryRun) {
    $dispatchArgs += "-DryRun"
}
if ($PreflightOnly) {
    $dispatchArgs += "-PreflightOnly"
}
if (-not [string]::IsNullOrWhiteSpace($PromptId)) {
    $dispatchArgs += @("-PromptId", $PromptId)
}

& powershell @dispatchArgs
exit $LASTEXITCODE
