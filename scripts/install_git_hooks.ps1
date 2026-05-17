param(
    [string]$RepositoryRoot
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "harness_common.ps1")
. (Join-Path $PSScriptRoot "git_workflow_common.ps1")

$rootDir = if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    Get-HarnessRoot -ScriptDirectory $PSScriptRoot
} else {
    [System.IO.Path]::GetFullPath($RepositoryRoot)
}

$hooksPath = Get-GitWorkflowResolvedPath -RootDir $rootDir -Name "hooks_path"
$portableHooksPath = Join-Path $rootDir "githooks"
if (-not (Test-Path -LiteralPath $portableHooksPath)) {
    $portableHooksPath = Join-Path $rootDir "harness\githooks"
}
Ensure-HarnessDirectory -Path $hooksPath

foreach ($hookName in @("pre-commit", "pre-push", "pre-merge-commit", "pre-rebase")) {
    $hookPath = Join-Path $hooksPath $hookName
    $portableHookPath = Join-Path $portableHooksPath $hookName
    if (Test-Path -LiteralPath $portableHookPath) {
        Copy-Item -LiteralPath $portableHookPath -Destination $hookPath -Force
    } else {
        throw "required hook template is missing: $portableHookPath"
    }
}

$absoluteHooksPath = [System.IO.Path]::GetFullPath($hooksPath)
Invoke-GitCommand -RootDir $rootDir -Arguments @("config", "--local", "core.hooksPath", $absoluteHooksPath) | Out-Null

Write-Output "hooks_path: $hooksPath"
Write-Output "git_config_core_hooksPath: $absoluteHooksPath"
