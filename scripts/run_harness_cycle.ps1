param(
    [switch]$SkipRetryPrompt
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "harness_common.ps1")

$rootDir = Get-HarnessRoot -ScriptDirectory $PSScriptRoot
$logDir = Get-HarnessConfiguredPath -RootDir $rootDir -Name "logs" -FallbackRelativePath "harness/reports/logs"
$latestReport = Get-HarnessConfiguredPath -RootDir $rootDir -Name "latest_report" -FallbackRelativePath "harness/reports/latest_report.md"
$preflightScript = Join-Path $PSScriptRoot "run_harness_preflight.ps1"
$generateRetryPromptScript = Join-Path $PSScriptRoot "generate_retry_prompt.ps1"
$preflightReport = Get-HarnessConfiguredPath -RootDir $rootDir -Name "preflight_report" -FallbackRelativePath "harness/reports/preflight_report.md"
$lockRoot = Get-HarnessLockRoot -RootDir $rootDir
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

Ensure-HarnessDirectory -Path $logDir
$cycleLock = Acquire-HarnessLock -LockRoot $lockRoot -LockName "cycle" -MaxAgeSeconds 1800
if ($null -eq $cycleLock) {
    throw "harness cycle lock is already held"
}

function Resolve-MakeCommand {
    if (Get-Command make -ErrorAction SilentlyContinue) {
        return "make"
    }

    if (Get-Command mingw32-make -ErrorAction SilentlyContinue) {
        return "mingw32-make"
    }

    throw "no make-compatible command found"
}

function Resolve-ExecutionCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $trimmed = $Command.Trim()
    if ($trimmed -match "^make(?=\s|$)") {
        $resolvedMake = Resolve-MakeCommand
        return $resolvedMake + $trimmed.Substring(4)
    }

    return $trimmed
}

function Invoke-Step {
    param(
        [string]$Command,
        [string]$LogFile
    )

    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & powershell -NoProfile -ExecutionPolicy Bypass -Command $Command 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }

    $outputText = ($output | Out-String)
    Write-Utf8File -Path $LogFile -Content $outputText
    return ($exitCode -eq 0)
}

function Get-FailureTypeFromLog {
    param([string]$LogFile)
    $text = Get-Content -Raw -LiteralPath $LogFile
    $environmentPatterns = Get-FailurePatternList -RootDir $rootDir -Name "environment" -Fallback @(
        "command not found",
        "not recognized",
        "No such file",
        "no make-compatible command found",
        "Access is denied",
        "Permission denied",
        "UnauthorizedAccessException",
        "EPERM",
        "EACCES"
    )
    $compilePatterns = Get-FailurePatternList -RootDir $rootDir -Name "compile" -Fallback @(
        "error:",
        "undefined reference",
        "fatal error"
    )
    $interfacePatterns = Get-FailurePatternList -RootDir $rootDir -Name "interface" -Fallback @(
        "mismatch",
        "incompatible",
        "conflict"
    )

    if ($text -match (($environmentPatterns | ForEach-Object { [Regex]::Escape($_) }) -join "|")) {
        return "environment"
    }

    if ($text -match (($compilePatterns | ForEach-Object { [Regex]::Escape($_) }) -join "|")) {
        return "compile"
    }

    if ($text -match (($interfacePatterns | ForEach-Object { [Regex]::Escape($_) }) -join "|")) {
        return "interface"
    }

    return "logic"
}

$buildLog = Join-Path $logDir "${timestamp}_build.log"
$unitLog = Join-Path $logDir "${timestamp}_unit.log"
$integrationLog = Join-Path $logDir "${timestamp}_integration.log"
$benchLog = Join-Path $logDir "${timestamp}_benchmark.log"

$buildStatus = "not_run"
$unitStatus = "not_run"
$integrationStatus = "not_run"
$benchmarkStatus = "not_run"
$overallStatus = "pass"
$failureType = "none"
$failureModule = "none"
$nextOwner = "none"
$nextTask = "none"
$retryPromptStatus = "not_needed"
$retryPromptMessage = "none"

try {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $preflightOutput = & powershell -ExecutionPolicy Bypass -File $preflightScript -Quiet 2>&1
        $preflightExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($preflightExitCode -ne 0) {
        $buildStatus = "fail"
        $overallStatus = "fail"
        $failureType = "environment"
        $failureModule = "profile"
        $nextOwner = Get-DispatchConfigValue -RootDir $rootDir -Name "environment_owner" -Fallback "manager-harness"
        $nextTask = "fix project profile, missing docs, or missing commands reported in harness/reports/preflight_report.md"
        if ($null -ne $preflightOutput) {
            $preflightText = ($preflightOutput | Out-String).Trim()
            if (-not [string]::IsNullOrWhiteSpace($preflightText)) {
                $nextTask += " | " + ($preflightText -replace "\r?\n", " | ")
            }
        }
        throw "harness preflight failed"
    }

    $buildCommand = Get-ProjectCommand -RootDir $rootDir -Name "build" -Fallback "make"
    $unitCommand = Get-ProjectCommand -RootDir $rootDir -Name "unit" -Fallback "make unit"
    $integrationCommand = Get-ProjectCommand -RootDir $rootDir -Name "integration" -Fallback "make integration"
    $benchmarkCommand = Get-ProjectCommand -RootDir $rootDir -Name "benchmark_smoke" -Fallback "make benchmark-smoke"

    try {
        $buildCommand = Resolve-ExecutionCommand -Command $buildCommand
        $unitCommand = Resolve-ExecutionCommand -Command $unitCommand
        $integrationCommand = Resolve-ExecutionCommand -Command $integrationCommand
        $benchmarkCommand = Resolve-ExecutionCommand -Command $benchmarkCommand
    } catch {
        $message = $_.Exception.Message
        Write-Utf8File -Path $buildLog -Content $message
        $buildStatus = "fail"
        $overallStatus = "fail"
        $failureType = "environment"
        $failureModule = "build"
        $nextOwner = Get-DispatchConfigValue -RootDir $rootDir -Name "environment_owner" -Fallback "manager-harness"
        $nextTask = "fix the toolchain or make command discovery"
        throw
    }

    Push-Location $rootDir
    try {
        if (-not (Invoke-Step $buildCommand $buildLog)) {
            $buildStatus = "fail"
            $overallStatus = "fail"
            $failureModule = "build"
            $nextOwner = Get-DispatchConfigValue -RootDir $rootDir -Name "compile_owner" -Fallback "manager-main"
            $nextTask = "fix build failure and reconcile interfaces"
            $failureType = Get-FailureTypeFromLog $buildLog
        } else {
            $buildStatus = "pass"
            if (-not (Invoke-Step $unitCommand $unitLog)) {
                $unitStatus = "fail"
                $overallStatus = "fail"
                $failureModule = "tests/unit"
                $nextOwner = "agent-tests"
                $nextTask = "fix or add unit coverage for failing behavior"
                $failureType = Get-FailureTypeFromLog $unitLog
            } else {
                $unitStatus = "pass"
                if (-not (Invoke-Step $integrationCommand $integrationLog)) {
                    $integrationStatus = "fail"
                    $overallStatus = "fail"
                    $failureModule = "tests/integration"
                    $nextOwner = "manager-main"
                    $nextTask = "trace integration failure and reassign affected module"
                    $failureType = Get-FailureTypeFromLog $integrationLog
                } else {
                    $integrationStatus = "pass"
                    if (-not (Invoke-Step $benchmarkCommand $benchLog)) {
                        $benchmarkStatus = "fail"
                        $overallStatus = "fail"
                        $failureModule = "benchmark-smoke"
                        $nextOwner = Get-DispatchConfigValue -RootDir $rootDir -Name "environment_owner" -Fallback "manager-harness"
                        $nextTask = "stabilize benchmark smoke path"
                        $failureType = Get-FailureTypeFromLog $benchLog
                    } else {
                        $benchmarkStatus = "pass"
                    }
                }
            }
        }
    } finally {
        Pop-Location
    }
} catch {
    if ($overallStatus -eq "pass") {
        $overallStatus = "fail"
    }
    if ($failureType -eq "none") {
        $failureType = "environment"
    }
    if ($failureModule -eq "none") {
        $failureModule = "harness-cycle"
    }
    if ($nextOwner -eq "none") {
        $nextOwner = Get-DispatchConfigValue -RootDir $rootDir -Name "environment_owner" -Fallback "manager-harness"
    }
    if ($nextTask -eq "none") {
        $nextTask = "fix harness cycle runner error: " + ($_.Exception.Message -replace "\r?\n", " | ")
    }
} finally {
    $report = @"
# Latest Harness Report

## Summary

- status: $overallStatus
- last_cycle: $timestamp

## Results

- build: $buildStatus
- unit: $unitStatus
- integration: $integrationStatus
- benchmark_smoke: $benchmarkStatus

## Logs

- build: $(Get-RelativeProjectPath -RootDir $rootDir -AbsolutePath $buildLog)
- unit: $(Get-RelativeProjectPath -RootDir $rootDir -AbsolutePath $unitLog)
- integration: $(Get-RelativeProjectPath -RootDir $rootDir -AbsolutePath $integrationLog)
- benchmark_smoke: $(Get-RelativeProjectPath -RootDir $rootDir -AbsolutePath $benchLog)
- preflight: $(Get-RelativeProjectPath -RootDir $rootDir -AbsolutePath $preflightReport)

## Failures

- type: $failureType
- module: $failureModule

## Next Actions

- owner: $nextOwner
- task: $nextTask
"@

    Write-Utf8File -Path $latestReport -Content $report

    if ($overallStatus -ne "pass" -and -not $SkipRetryPrompt) {
        try {
            $retryOutput = & powershell -ExecutionPolicy Bypass -File $generateRetryPromptScript 2>&1
            $retryText = ($retryOutput | Out-String).Trim()
            if ([string]::IsNullOrWhiteSpace($retryText)) {
                $retryPromptStatus = "unknown"
                $retryPromptMessage = "retry prompt script produced no output"
            } else {
                $retryPromptStatus = "generated"
                $retryPromptMessage = ($retryText -replace "\r?\n", " | ")
            }
        } catch {
            $retryPromptStatus = "error"
            $retryPromptMessage = ($_.Exception.Message -replace "\r?\n", " | ")
        }
    } elseif ($overallStatus -ne "pass") {
        $retryPromptStatus = "skipped"
        $retryPromptMessage = "retry prompt generation skipped by option"
    }

    $buildRecord = Write-TestResultRecord -RootDir $rootDir -Suite "build" -Status $buildStatus -Summary "Build command execution result from the latest harness cycle." -Metadata @{
        cycle = $timestamp
        owner = $(if ($failureModule -eq "build") { $nextOwner } else { "none" })
    } -Artifacts @($buildLog, $latestReport)
    $unitRecord = Write-TestResultRecord -RootDir $rootDir -Suite "unit" -Status $unitStatus -Summary "Unit test execution result from the latest harness cycle." -Metadata @{
        cycle = $timestamp
        owner = $(if ($failureModule -eq "tests/unit") { $nextOwner } else { "none" })
    } -Artifacts @($unitLog, $latestReport)
    $integrationRecord = Write-TestResultRecord -RootDir $rootDir -Suite "integration" -Status $integrationStatus -Summary "Integration test execution result from the latest harness cycle." -Metadata @{
        cycle = $timestamp
        owner = $(if ($failureModule -eq "tests/integration") { $nextOwner } else { "none" })
    } -Artifacts @($integrationLog, $latestReport)
    $benchmarkRecord = Write-TestResultRecord -RootDir $rootDir -Suite "benchmark_smoke" -Status $benchmarkStatus -Summary "Benchmark smoke execution result from the latest harness cycle." -Metadata @{
        cycle = $timestamp
        owner = $(if ($failureModule -eq "benchmark-smoke") { $nextOwner } else { "none" })
    } -Artifacts @($benchLog, $latestReport)
    $cycleRecord = Write-TestResultRecord -RootDir $rootDir -Suite "full_cycle" -Status $overallStatus -Summary "Aggregate harness cycle result including build, unit, integration, benchmark smoke, and preflight." -Metadata @{
        cycle = $timestamp
        failure_type = $failureType
        failure_module = $failureModule
        next_owner = $nextOwner
        next_task = $nextTask
        retry_prompt_status = $retryPromptStatus
        retry_prompt_message = $retryPromptMessage
    } -Artifacts @($latestReport, $preflightReport, $buildLog, $unitLog, $integrationLog, $benchLog)
    Release-HarnessLock -LockPath $cycleLock
}

Write-Output "harness cycle status: $overallStatus"
Write-Output "latest report: $latestReport"
Write-Output "cycle records: $cycleRecord"
if ($overallStatus -ne "pass") {
    Write-Output "retry prompt: $retryPromptStatus"
    Write-Output "retry prompt detail: $retryPromptMessage"
}

if ($overallStatus -ne "pass") {
    exit 1
}
