param(
    [Parameter(Mandatory = $true)]
    [string]$Agent,
    [Parameter(Mandatory = $true)]
    [ValidateSet("pass", "fail")]
    [string]$Result,
    [string]$AssignmentId
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "harness_common.ps1")

$rootDir = Get-HarnessRoot -ScriptDirectory $PSScriptRoot
$assignmentLog = Get-HarnessConfiguredPath -RootDir $rootDir -Name "assignment_log" -FallbackRelativePath "harness/reports/assignment_log.md"
$lockRoot = Get-HarnessLockRoot -RootDir $rootDir
$ownerDirs = Get-AssignmentDirectories -RootDir $rootDir -Owner $Agent

if (-not (Test-Path -LiteralPath $assignmentLog)) {
    Write-Utf8File -Path $assignmentLog -Content "# Assignment Log`n`n## Entries`n"
}

$completeLock = Acquire-HarnessLock -LockRoot $lockRoot -LockName ("complete_" + $Agent) -MaxAgeSeconds 900
if ($null -eq $completeLock) {
    throw "complete lock is already held for $Agent"
}

try {
    $progressItems = Get-ChildItem -LiteralPath $ownerDirs.InProgress -File | Sort-Object LastWriteTime

    if ([string]::IsNullOrWhiteSpace($AssignmentId)) {
        if ($progressItems.Count -gt 1) {
            throw "multiple assignments are in progress for $Agent; specify -AssignmentId"
        }
        $currentItem = $progressItems | Select-Object -First 1
    } else {
        $currentItem = $progressItems | Where-Object { $_.BaseName -eq $AssignmentId } | Select-Object -First 1
    }

    if ($null -eq $currentItem) {
        Write-Output "no matching assignment in progress for $Agent"
        exit 0
    }

    $doneContent = Get-Content -Raw -LiteralPath $currentItem.FullName
    $doneContent = $doneContent -replace "- status: in_progress", "- status: done"
    $doneContent = $doneContent -replace "- result: pending", "- result: $Result"
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($currentItem.Name)
    $extension = [System.IO.Path]::GetExtension($currentItem.Name)
    $targetName = $baseName + "__" + $Result + $extension
    $targetPath = Join-Path $ownerDirs.Done $targetName

    Move-FileWithUpdatedContent -SourcePath $currentItem.FullName -TargetPath $targetPath -UpdatedContent $doneContent

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = @"
- time: $timestamp
  - action: complete
  - owner: $Agent
  - result: $Result
  - assignment_id: $baseName
  - assignment: $targetName
"@
    Append-Utf8File -Path $assignmentLog -Content $entry
    Write-Output "completed assignment: $targetPath"
} finally {
    Release-HarnessLock -LockPath $completeLock
}
