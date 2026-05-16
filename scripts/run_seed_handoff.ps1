param(
    [switch]$Ephemeral,
    [string]$Model,
    [switch]$DryRun,
    [switch]$PreflightOnly,
    [int]$MaxWorkerAttempts = 3,
    [switch]$StopOnWorkerFailure,
    [switch]$SkipAutoAdvanceGit,
    [string]$PlanFile
)

$ErrorActionPreference = "Stop"

$installHooksScript = Join-Path $PSScriptRoot "install_git_hooks.ps1"
$preflightScript = Join-Path $PSScriptRoot "run_harness_preflight.ps1"
$dispatchScript = Join-Path $PSScriptRoot "dispatch_seed_plan.ps1"

& powershell -ExecutionPolicy Bypass -File $installHooksScript
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& powershell -ExecutionPolicy Bypass -File $preflightScript
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
if ($MaxWorkerAttempts -gt 0) {
    $dispatchArgs += @("-MaxWorkerAttempts", $MaxWorkerAttempts)
}
if ($StopOnWorkerFailure) {
    $dispatchArgs += "-StopOnWorkerFailure"
}
if ($SkipAutoAdvanceGit) {
    $dispatchArgs += "-SkipAutoAdvanceGit"
}
if (-not [string]::IsNullOrWhiteSpace($PlanFile)) {
    $dispatchArgs += @("-PlanFile", $PlanFile)
}

& powershell @dispatchArgs
exit $LASTEXITCODE
