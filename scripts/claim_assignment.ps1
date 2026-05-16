param(
    [Parameter(Mandatory = $true)]
    [string]$Agent,
    [string]$AssignmentId
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "harness_common.ps1")

$rootDir = Get-HarnessRoot -ScriptDirectory $PSScriptRoot
$assignmentLog = Get-HarnessConfiguredPath -RootDir $rootDir -Name "assignment_log" -FallbackRelativePath "harness/reports/assignment_log.md"
$lockRoot = Join-Path $rootDir "harness\state\locks"
$ownerDirs = Get-AssignmentDirectories -RootDir $rootDir -Owner $Agent

if (-not (Test-Path -LiteralPath $assignmentLog)) {
    Write-Utf8File -Path $assignmentLog -Content "# Assignment Log`n`n## Entries`n"
}

$claimLock = Acquire-HarnessLock -LockRoot $lockRoot -LockName ("claim_" + $Agent) -MaxAgeSeconds 900
if ($null -eq $claimLock) {
    throw "claim lock is already held for $Agent"
}

try {
    $inboxItems = Get-ChildItem -LiteralPath $ownerDirs.Inbox -File | Sort-Object LastWriteTime

    if ([string]::IsNullOrWhiteSpace($AssignmentId)) {
        if ($inboxItems.Count -gt 1) {
            throw "multiple assignments exist for $Agent; specify -AssignmentId"
        }
        $nextItem = $inboxItems | Select-Object -First 1
    } else {
        $nextItem = $inboxItems | Where-Object { $_.BaseName -eq $AssignmentId } | Select-Object -First 1
    }

    if ($null -eq $nextItem) {
        Write-Output "no matching assignment in inbox for $Agent"
        exit 0
    }

    $progressContent = Get-Content -Raw -LiteralPath $nextItem.FullName
    $progressContent = $progressContent -replace "- status: inbox", "- status: in_progress"
    $targetPath = Join-Path $ownerDirs.InProgress $nextItem.Name
    Move-FileWithUpdatedContent -SourcePath $nextItem.FullName -TargetPath $targetPath -UpdatedContent $progressContent

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = @"
- time: $timestamp
  - action: claim
  - owner: $Agent
  - assignment_id: $($nextItem.BaseName)
  - assignment: $($nextItem.Name)
"@
    Append-Utf8File -Path $assignmentLog -Content $entry
    Write-Output "claimed assignment: $targetPath"
} finally {
    Release-HarnessLock -LockPath $claimLock
}
