param(
    [Parameter(Mandatory = $true)]
    [string]$Agent,
    [Parameter(Mandatory = $true)]
    [string]$AssignmentId,
    [switch]$Ephemeral,
    [string]$Model,
    [switch]$DryRun,
    [switch]$PreflightOnly
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "harness_common.ps1")
. (Join-Path $PSScriptRoot "git_workflow_common.ps1")

$rootDir = Get-HarnessRoot -ScriptDirectory $PSScriptRoot
$runsDir = Get-HarnessConfiguredPath -RootDir $rootDir -Name "agent_runs" -FallbackRelativePath "harness/reports/agent_runs"
$lockRoot = Get-HarnessLockRoot -RootDir $rootDir
$dispatchPackets = Get-HarnessConfiguredPath -RootDir $rootDir -Name "dispatch_packets" -FallbackRelativePath "harness/reports/dispatch_packets"
$assignmentLog = Get-HarnessConfiguredPath -RootDir $rootDir -Name "assignment_log" -FallbackRelativePath "harness/reports/assignment_log.md"
$liveDispatchLog = Get-HarnessConfiguredPath -RootDir $rootDir -Name "live_dispatch_log" -FallbackRelativePath "harness/reports/live_dispatch_log.md"
$codexCommand = Get-Command codex -ErrorAction SilentlyContinue
$executionRoot = $rootDir

if ($null -eq $codexCommand) {
    throw "codex command not found in PATH"
}

Ensure-HarnessDirectory -Path $runsDir
if (-not (Test-Path -LiteralPath $liveDispatchLog)) {
    Write-Utf8File -Path $liveDispatchLog -Content "# Live Dispatch Log`n`n## Entries`n"
}
$ownerDirs = Get-AssignmentDirectories -RootDir $rootDir -Owner $Agent
$invokeLock = Acquire-HarnessLock -LockRoot $lockRoot -LockName ("invoke_" + $AssignmentId) -MaxAgeSeconds 7200
if ($null -eq $invokeLock) {
    throw "invoke lock is already held for assignment $AssignmentId"
}

function Get-AssignmentFilePath {
    param(
        [string]$BaseDir,
        [string]$Id
    )

    $file = Get-ChildItem -LiteralPath $BaseDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -eq $Id } |
        Select-Object -First 1
    if ($null -eq $file) {
        return $null
    }

    return $file.FullName
}

try {
    $inboxPath = Get-AssignmentFilePath -BaseDir $ownerDirs.Inbox -Id $AssignmentId
    $progressPath = Get-AssignmentFilePath -BaseDir $ownerDirs.InProgress -Id $AssignmentId
    if ($null -eq $inboxPath -and $null -eq $progressPath) {
        $doneMatch = Get-ChildItem -LiteralPath $ownerDirs.Done -File -ErrorAction SilentlyContinue |
            Where-Object { $_.BaseName -like ($AssignmentId + "__*") } |
            Select-Object -First 1
        if ($null -ne $doneMatch) {
            Write-Output "assignment already completed: $($doneMatch.FullName)"
            exit 0
        }

        throw "assignment not found in inbox or in_progress: $AssignmentId"
    }

    $assignmentPath = $progressPath
    if ($null -eq $assignmentPath) {
        $assignmentPath = $inboxPath
    }

    $assignmentContent = Get-Content -LiteralPath $assignmentPath
    $featureBranch = Get-MarkdownValue -Content $assignmentContent -Key "feature_branch"
    if ([string]::IsNullOrWhiteSpace($featureBranch)) {
        $featureBranch = Get-GitExpectedAssignmentBranch -RootDir $rootDir -Owner $Agent -AssignmentId $AssignmentId
    }
    $branchBefore = Get-GitCurrentBranch -RootDir $rootDir
    $branchAfter = $branchBefore
    $branchAction = "none"
    $branchStatus = "unchanged"
    $branchBase = ""
    $workspaceAction = "none"
    $workspaceStatus = "shared_workspace"
    $worktreePath = Get-GitAssignmentWorktreePath -RootDir $rootDir -Owner $Agent -AssignmentId $AssignmentId

    if ($DryRun -or $PreflightOnly) {
        $branchBase = Get-GitAssignmentBaseBranch -RootDir $rootDir
        $branchStatus = "live_execution_will_use_isolated_worktree"
        $workspaceAction = "plan_only"
        $workspaceStatus = "isolated_worktree_will_be_used"
    } else {
        $worktreeContext = Ensure-GitAssignmentWorktree -RootDir $rootDir -Owner $Agent -AssignmentId $AssignmentId
        $executionRoot = $worktreeContext.WorktreePath
        $worktreePath = $worktreeContext.WorktreePath
        $branchBase = $worktreeContext.BaseBranch
        $workspaceAction = $(if ($worktreeContext.CreatedWorktree) { "created_worktree" } else { "reused_worktree" })
        $workspaceStatus = "isolated_worktree_ready"
        $previousGitWorkspace = [Environment]::GetEnvironmentVariable("CODEX_GIT_WORKSPACE_ROOT")
        try {
            [Environment]::SetEnvironmentVariable("CODEX_GIT_WORKSPACE_ROOT", $executionRoot)
            $branchAfter = Get-GitCurrentBranch -RootDir $rootDir
        } finally {
            [Environment]::SetEnvironmentVariable("CODEX_GIT_WORKSPACE_ROOT", $previousGitWorkspace)
        }
        $branchAction = $(if ($worktreeContext.CreatedBranch) { "created_branch_in_worktree" } else { "reused_branch_in_worktree" })
        $branchStatus = "ready_in_isolated_worktree"
    }

    if (-not $DryRun -and -not $PreflightOnly -and $null -ne $inboxPath) {
        & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "claim_assignment.ps1") -Agent $Agent -AssignmentId $AssignmentId | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "failed to claim assignment $AssignmentId"
        }

        $progressPath = Get-AssignmentFilePath -BaseDir $ownerDirs.InProgress -Id $AssignmentId
        if ($null -eq $progressPath) {
            throw "assignment was claimed but is not present in in_progress: $AssignmentId"
        }
    }

    $assignmentPath = $progressPath
    if ($null -eq $assignmentPath) {
        $assignmentPath = $inboxPath
    }

    $assignmentContent = Get-Content -LiteralPath $assignmentPath
    $workArea = Get-MarkdownValue -Content $assignmentContent -Key "work_area"
    $validation = Get-MarkdownValue -Content $assignmentContent -Key "validation"
    $task = Get-MarkdownValue -Content $assignmentContent -Key "task"
    $packetFile = Join-Path $dispatchPackets ($AssignmentId + ".md")
    $promptFile = Join-Path $runsDir ($AssignmentId + "__prompt.md")
    $lastMessageFile = Join-Path $runsDir ($AssignmentId + "__last_message.txt")
    $runLogFile = Join-Path $runsDir ($AssignmentId + "__run.log")
    $summaryFile = Join-Path $runsDir ($AssignmentId + "__summary.md")

    if (-not (Test-Path -LiteralPath $packetFile)) {
        throw "dispatch packet not found: $packetFile"
    }
    $packetText = Get-Content -Raw -LiteralPath $packetFile

    if ([string]::IsNullOrWhiteSpace($workArea)) {
        $workArea = "project-wide"
    }

    $prompt = @"
You are the assigned owner worker for assignment `$AssignmentId`.

Read and follow the assignment packet below.

$packetText

Execution rules:
- The assignment has already been claimed and is currently in progress.
- Work primarily in: $workArea
- Execute from isolated worktree: $executionRoot
- Required feature branch: $featureBranch
- Required validation: $validation
- Required task: $task
- You are not alone in the codebase. Do not revert edits you did not make.
- If you create a commit or push, follow `harness/configs/git_policy.md`.
- If validation is expressed as multiple commands joined with `&&`, run the shell-appropriate sequential equivalent in the current environment.
- Before finishing, if validation passes, run:
  powershell -ExecutionPolicy Bypass -File scripts/complete_assignment.ps1 -Agent $Agent -AssignmentId $AssignmentId -Result pass
- If you are blocked or validation fails, run:
  powershell -ExecutionPolicy Bypass -File scripts/complete_assignment.ps1 -Agent $Agent -AssignmentId $AssignmentId -Result fail
- In your final message, briefly summarize changed files, validation run, and remaining risks.
"@
    Write-Utf8File -Path $promptFile -Content $prompt

    $codexVersion = ""
    try {
        $codexVersion = (& cmd /c "codex --version 2>NUL" | Out-String).Trim()
    } catch {
        $codexVersion = ""
    }
    if ([string]::IsNullOrWhiteSpace($codexVersion)) {
        $codexVersion = "unknown"
    }
    $mode = "execute"
    if ($PreflightOnly) {
        $mode = "preflight"
    } elseif ($DryRun) {
        $mode = "dry_run"
    }

    $readiness = @"
# Agent Invocation Readiness

## Meta

- assignment_id: $AssignmentId
- owner: $Agent
- mode: $mode
- codex_path: $($codexCommand.Source)
- codex_version: $codexVersion
- assignment_file: $assignmentPath
- packet_file: $packetFile
- prompt_file: $promptFile
- work_area: $workArea
- execution_root: $executionRoot
- worktree_path: $worktreePath
- workspace_action: $workspaceAction
- workspace_status: $workspaceStatus
- feature_branch: $featureBranch
- branch_before: $branchBefore
- branch_after: $branchAfter
- branch_action: $branchAction
- branch_base: $(if ([string]::IsNullOrWhiteSpace($branchBase)) { "none" } else { $branchBase })
- branch_status: $branchStatus
- validation: $validation
"@

    if ($PreflightOnly -or $DryRun) {
        Write-Utf8File -Path $summaryFile -Content $readiness
        if ($DryRun) {
            Write-Utf8File -Path $runLogFile -Content "dry run only; codex exec was not started"
            Write-Output "dry run summary: $summaryFile"
        } else {
            Write-Utf8File -Path $runLogFile -Content "preflight only; codex exec was not started"
            Write-Output "preflight summary: $summaryFile"
        }
        $previewTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $previewEntry = @"
- time: $previewTimestamp
  - assignment_id: $AssignmentId
  - owner: $Agent
  - mode: $mode
  - result: not-run
  - feature_branch: $featureBranch
  - branch_status: $branchStatus
  - summary: $summaryFile
"@
        Append-Utf8File -Path $liveDispatchLog -Content $previewEntry
        exit 0
    }

    $codexArgs = @(
        "exec",
        "--full-auto",
        "--skip-git-repo-check",
        "--color", "never"
    )
    if ($Ephemeral) {
        $codexArgs += "--ephemeral"
    }
    if (-not [string]::IsNullOrWhiteSpace($Model)) {
        $codexArgs += @("-m", $Model)
    }
    $codexArgs += @(
        "-C", $executionRoot,
        "-o", $lastMessageFile,
        "-"
    )

    $startTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $previousErrorActionPreference = $ErrorActionPreference
    $previousHarnessRoot = [Environment]::GetEnvironmentVariable("CODEX_HARNESS_ROOT")
    $previousGitWorkspace = [Environment]::GetEnvironmentVariable("CODEX_GIT_WORKSPACE_ROOT")
    $ErrorActionPreference = "Continue"
    try {
        [Environment]::SetEnvironmentVariable("CODEX_HARNESS_ROOT", $rootDir)
        [Environment]::SetEnvironmentVariable("CODEX_GIT_WORKSPACE_ROOT", $executionRoot)
        $output = $prompt | & $codexCommand.Source @codexArgs 2>&1 | ForEach-Object { $_.ToString() }
        $exitCode = $LASTEXITCODE
    } finally {
        [Environment]::SetEnvironmentVariable("CODEX_HARNESS_ROOT", $previousHarnessRoot)
        [Environment]::SetEnvironmentVariable("CODEX_GIT_WORKSPACE_ROOT", $previousGitWorkspace)
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $runLogText = ($output -join [Environment]::NewLine)
    Write-Utf8File -Path $runLogFile -Content $runLogText

    $doneAfterRun = Get-ChildItem -LiteralPath $ownerDirs.Done -File -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -like ($AssignmentId + "__*") } |
        Select-Object -First 1

    if ($null -eq $doneAfterRun) {
        $autoResult = "fail"
        if ($exitCode -eq 0) {
            $autoResult = "pass"
        }
        & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "complete_assignment.ps1") -Agent $Agent -AssignmentId $AssignmentId -Result $autoResult | Out-Null
    }

    $finalAssignmentFile = Get-ChildItem -LiteralPath $ownerDirs.Done -File -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -like ($AssignmentId + "__*") } |
        Select-Object -First 1
    $finalResult = "unknown"
    if ($null -ne $finalAssignmentFile) {
        $finalContent = Get-Content -LiteralPath $finalAssignmentFile.FullName
        $finalResult = Get-MarkdownValue -Content $finalContent -Key "result"
    }

    $lastMessage = ""
    if (Test-Path -LiteralPath $lastMessageFile) {
        $lastMessage = Get-Content -Raw -LiteralPath $lastMessageFile
    }

    $summary = @"
# Agent Run Summary

## Meta

- assignment_id: $AssignmentId
- owner: $Agent
- exit_code: $exitCode
- result: $finalResult
- work_area: $workArea
- execution_root: $executionRoot
- worktree_path: $worktreePath
- workspace_action: $workspaceAction
- workspace_status: $workspaceStatus
- feature_branch: $featureBranch
- branch_before: $branchBefore
- branch_after: $branchAfter
- branch_action: $branchAction
- branch_base: $(if ([string]::IsNullOrWhiteSpace($branchBase)) { "none" } else { $branchBase })

## Files

- packet: $packetFile
- prompt: $promptFile
- run_log: $runLogFile
- last_message: $lastMessageFile

## Validation

- command: $validation

## Last Message

$lastMessage
"@
    Write-Utf8File -Path $summaryFile -Content $summary

    $finishTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = @"
- time: $finishTimestamp
  - assignment_id: $AssignmentId
  - owner: $Agent
  - started_at: $startTimestamp
  - exit_code: $exitCode
  - result: $finalResult
  - feature_branch: $featureBranch
  - summary: $summaryFile
  - run_log: $runLogFile
"@
    Append-Utf8File -Path $liveDispatchLog -Content $entry

    Write-Output "codex run summary: $summaryFile"
    if ($exitCode -ne 0) {
        exit $exitCode
    }
} catch {
    if (-not $DryRun -and -not $PreflightOnly) {
        $doneAfterFailure = Get-ChildItem -LiteralPath $ownerDirs.Done -File -ErrorAction SilentlyContinue |
            Where-Object { $_.BaseName -like ($AssignmentId + "__*") } |
            Select-Object -First 1
        $progressAfterFailure = Get-AssignmentFilePath -BaseDir $ownerDirs.InProgress -Id $AssignmentId
        if ($null -eq $doneAfterFailure -and $null -ne $progressAfterFailure) {
            try {
                & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "complete_assignment.ps1") -Agent $Agent -AssignmentId $AssignmentId -Result fail | Out-Null
            } catch {
                Write-Warning ("failed to mark assignment as fail after invoke error: " + $_.Exception.Message)
            }
        }
    }

    throw
} finally {
    Release-HarnessLock -LockPath $invokeLock
}
