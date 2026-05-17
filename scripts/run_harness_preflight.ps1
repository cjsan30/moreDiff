param(
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "harness_common.ps1")
. (Join-Path $PSScriptRoot "git_workflow_common.ps1")

$rootDir = Get-HarnessRoot -ScriptDirectory $PSScriptRoot
$reportPath = Get-HarnessConfiguredPath -RootDir $rootDir -Name "preflight_report" -FallbackRelativePath "harness/reports/preflight_report.md"
$issues = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Issue {
    param([string]$Message)
    $issues.Add($Message) | Out-Null
}

function Add-WarningEntry {
    param([string]$Message)
    $warnings.Add($Message) | Out-Null
}

function Test-IsSelfReferentialGitGateAuditIssue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Issue,
        [Parameter(Mandatory = $true)]
        [string]$BranchKind,
        [AllowEmptyString()]
        [string]$ActiveGateStage
    )

    if ([string]::IsNullOrWhiteSpace($ActiveGateStage)) {
        return $false
    }

    switch ($ActiveGateStage) {
        "feature" {
            return ($BranchKind -eq "feature" -and $Issue -like "*missing a passing feature gate*")
        }
        "final" {
            return ($BranchKind -eq "test" -and $Issue -like "*missing a passing final gate*")
        }
        default {
            return $false
        }
    }
}

function Test-IsPassingStagedFeatureGateAuditIssue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDirectory,
        [Parameter(Mandatory = $true)]
        $State,
        [Parameter(Mandatory = $true)]
        [string]$BranchName,
        [Parameter(Mandatory = $true)]
        [string]$Issue,
        [Parameter(Mandatory = $true)]
        [string]$BranchKind
    )

    if ($BranchKind -ne "feature" -or $Issue -notlike "*missing a passing feature gate*") {
        return $false
    }

    try {
        $candidateStatus = Assert-SealedGitCandidate -RootDir $RootDirectory -RequireStagedChanges
        if (-not $candidateStatus.HasStagedChanges) {
            return $false
        }

        $indexTree = Get-GitIndexTree -RootDir $RootDirectory
        if ([string]::IsNullOrWhiteSpace($indexTree)) {
            return $false
        }

        $validation = Get-LatestGitValidation -State $State -Branch $BranchName -Stage "feature" -Status "pass" -TreeHash $indexTree
        return ($null -ne $validation)
    } catch {
        return $false
    }
}

function Test-WriteTarget {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedPath,
        [switch]$AsDirectory
    )

    try {
        $targetDir = if ($AsDirectory) { $ResolvedPath } else { Split-Path -Parent $ResolvedPath }
        if ([string]::IsNullOrWhiteSpace($targetDir)) {
            return $false
        }

        Ensure-HarnessDirectory -Path $targetDir
        $probePath = Join-Path $targetDir (".preflight_write_test_" + [Guid]::NewGuid().ToString("N") + ".tmp")
        Write-Utf8File -Path $probePath -Content "probe"
        Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
        return $true
    } catch {
        return $false
    }
}

function Get-CommandHead {
    param([string]$CommandText)

    if ([string]::IsNullOrWhiteSpace($CommandText)) {
        return ""
    }

    $trimmed = $CommandText.Trim()
    if ($trimmed.StartsWith('"')) {
        $endIndex = $trimmed.IndexOf('"', 1)
        if ($endIndex -gt 1) {
            return $trimmed.Substring(1, $endIndex - 1)
        }
    }

    if ($trimmed.StartsWith("'")) {
        $endIndex = $trimmed.IndexOf("'", 1)
        if ($endIndex -gt 1) {
            return $trimmed.Substring(1, $endIndex - 1)
        }
    }

    return ($trimmed -split "\s+")[0]
}

function Test-CommandAvailable {
    param(
        [string]$RootDirectory,
        [string]$CommandText
    )

    if ([string]::IsNullOrWhiteSpace($CommandText)) {
        return $false
    }

    $head = Get-CommandHead -CommandText $CommandText
    if ([string]::IsNullOrWhiteSpace($head)) {
        return $false
    }

    if ($head -eq "make") {
        return ($null -ne (Get-Command make -ErrorAction SilentlyContinue) -or
            $null -ne (Get-Command mingw32-make -ErrorAction SilentlyContinue))
    }

    if ($head.Contains("\") -or $head.Contains("/") -or $head.StartsWith(".")) {
        try {
            $candidate = Resolve-ProjectPath -RootDir $RootDirectory -ProjectPath $head -Label ("command path for " + $CommandText)
            return (Test-Path -LiteralPath $candidate)
        } catch {
            return $false
        }
    }

    return ($null -ne (Get-Command $head -ErrorAction SilentlyContinue))
}

$profilePath = Get-ProjectProfilePath -RootDir $rootDir
$generatedProfileDoc = Join-Path $rootDir "docs\project_profile_generated.md"
if ([string]::IsNullOrWhiteSpace($profilePath)) {
    Add-Issue "missing harness/project/configs/project_profile.json"
} else {
    try {
        $profile = Get-ProjectProfile -RootDir $rootDir
    } catch {
        Add-Issue ("failed to parse project profile: " + $_.Exception.Message)
    }
}

if ($issues.Count -eq 0) {
    $project = Get-ProjectObjectProperty -Object $profile -Name "project"
    $requirements = Get-ProjectObjectProperty -Object $profile -Name "requirements"
    $commands = Get-ProjectObjectProperty -Object $profile -Name "commands"
    $owners = Get-ProjectObjectProperty -Object $profile -Name "owners"
    $dispatch = Get-ProjectObjectProperty -Object $profile -Name "dispatch"
    $failurePatterns = Get-ProjectObjectProperty -Object $profile -Name "failure_patterns"
    $gitWorkflow = Get-ProjectObjectProperty -Object $profile -Name "git_workflow"

    foreach ($requiredSection in @("project", "requirements", "commands", "owners", "dispatch", "git_workflow", "harness")) {
        if ($null -eq (Get-ProjectObjectProperty -Object $profile -Name $requiredSection)) {
            Add-Issue ("project profile missing section: " + $requiredSection)
        }
    }

    $projectName = Get-ProjectObjectProperty -Object $project -Name "name"
    if ([string]::IsNullOrWhiteSpace($projectName) -or $projectName -match "replace-with") {
        Add-Issue "project.name is empty or still a template value"
    }

    $sourceDocs = Get-ProfileStringArray -Value (Get-ProjectObjectProperty -Object $requirements -Name "source_docs")
    if ($sourceDocs.Count -eq 0) {
        Add-Issue "requirements.source_docs is empty"
    }
    foreach ($doc in $sourceDocs) {
        $docPath = Join-Path $rootDir ($doc -replace "/", "\")
        if (-not (Test-Path -LiteralPath $docPath)) {
            Add-Issue ("missing source doc: " + $doc)
        }
    }

    foreach ($commandName in @("build", "unit", "integration", "benchmark_smoke", "full_cycle")) {
        $value = Get-ProjectObjectProperty -Object $commands -Name $commandName
        if ([string]::IsNullOrWhiteSpace($value) -or $value -match "replace-with") {
            Add-Issue ("commands." + $commandName + " is empty or still a template value")
            continue
        }
        if (-not (Test-CommandAvailable -RootDirectory $rootDir -CommandText $value)) {
            Add-Issue ("command head is not available for commands." + $commandName + ": " + $value)
        }
    }

    foreach ($ownerName in @("manager-main", "manager-harness")) {
        if ($null -eq (Get-ProjectObjectProperty -Object $owners -Name $ownerName)) {
            Add-Issue ("owners." + $ownerName + " is missing")
        }
    }

    foreach ($ownerProperty in $owners.PSObject.Properties) {
        $ownerName = $ownerProperty.Name
        $ownerConfig = $ownerProperty.Value
        $workArea = Get-ProjectObjectProperty -Object $ownerConfig -Name "work_area"
        $validation = Get-ProjectObjectProperty -Object $ownerConfig -Name "validation"
        $readList = Get-ProfileStringArray -Value (Get-ProjectObjectProperty -Object $ownerConfig -Name "read")

        if ([string]::IsNullOrWhiteSpace($workArea)) {
            Add-Issue ("owners." + $ownerName + ".work_area is empty")
        } elseif ($workArea -ne "project-wide") {
            try {
                $workAreaPath = Resolve-ProjectPath -RootDir $rootDir -ProjectPath $workArea -Label ("owners." + $ownerName + ".work_area")
                if (-not (Test-Path -LiteralPath $workAreaPath)) {
                    Add-WarningEntry ("work area does not exist yet for " + $ownerName + ": " + $workArea)
                }
            } catch {
                Add-Issue $_.Exception.Message
            }
        }

        if ([string]::IsNullOrWhiteSpace($validation) -or $validation -match "replace-with") {
            Add-Issue ("owners." + $ownerName + ".validation is empty or still a template value")
        }

        if ($readList.Count -eq 0) {
            Add-Issue ("owners." + $ownerName + ".read is empty")
        } else {
            foreach ($readItem in $readList) {
                try {
                    $readPath = Resolve-ProjectPath -RootDir $rootDir -ProjectPath $readItem -Label ("owners." + $ownerName + ".read")
                    if (-not (Test-Path -LiteralPath $readPath)) {
                        Add-WarningEntry ("owner read path missing for " + $ownerName + ": " + $readItem)
                    }
                } catch {
                    Add-Issue $_.Exception.Message
                }
            }
        }
    }

    $harnessPathChecks = @(
        @{ Name = "logs"; Kind = "directory"; Fallback = "harness/reports/logs" },
        @{ Name = "latest_report"; Kind = "file"; Fallback = "harness/reports/latest_report.md" },
        @{ Name = "preflight_report"; Kind = "file"; Fallback = "harness/reports/preflight_report.md" },
        @{ Name = "test_results"; Kind = "directory"; Fallback = "harness/reports/test_results" },
        @{ Name = "retry_prompts"; Kind = "directory"; Fallback = "harness/reports/retry_prompts" },
        @{ Name = "seed_plans"; Kind = "directory"; Fallback = "harness/reports/seed_plans" },
        @{ Name = "dispatch_packets"; Kind = "directory"; Fallback = "harness/reports/dispatch_packets" },
        @{ Name = "agent_runs"; Kind = "directory"; Fallback = "harness/reports/agent_runs" },
        @{ Name = "assignments_root"; Kind = "directory"; Fallback = "harness/assignments" },
        @{ Name = "assignment_worktrees_root"; Kind = "directory"; Fallback = "harness/state/worktrees" },
        @{ Name = "dispatch_log"; Kind = "file"; Fallback = "harness/reports/dispatch_log.md" },
        @{ Name = "seed_dispatch_log"; Kind = "file"; Fallback = "harness/reports/seed_dispatch_log.md" },
        @{ Name = "assignment_log"; Kind = "file"; Fallback = "harness/reports/assignment_log.md" },
        @{ Name = "live_dispatch_log"; Kind = "file"; Fallback = "harness/reports/live_dispatch_log.md" }
    )
    foreach ($harnessCheck in $harnessPathChecks) {
        try {
            $resolvedHarnessPath = Get-HarnessConfiguredPath -RootDir $rootDir -Name $harnessCheck.Name -FallbackRelativePath $harnessCheck.Fallback
            $asDirectory = ($harnessCheck.Kind -eq "directory")
            if (-not (Test-WriteTarget -ResolvedPath $resolvedHarnessPath -AsDirectory:$asDirectory)) {
                Add-Issue ("cannot write to harness." + $harnessCheck.Name + ": " + $resolvedHarnessPath)
            }
        } catch {
            Add-Issue $_.Exception.Message
        }
    }

    foreach ($dispatchKey in @("compile_owner", "interface_owner", "environment_owner", "default_failure_type", "repeat_failure_escalation_owner")) {
        $value = Get-ProjectObjectProperty -Object $dispatch -Name $dispatchKey
        if ([string]::IsNullOrWhiteSpace($value)) {
            Add-Issue ("dispatch." + $dispatchKey + " is empty")
        }
    }

    foreach ($patternKey in @("environment", "compile", "interface")) {
        $patternList = Get-ProfileStringArray -Value (Get-ProjectObjectProperty -Object $failurePatterns -Name $patternKey)
        if ($patternList.Count -eq 0) {
            Add-WarningEntry ("failure_patterns." + $patternKey + " is empty; fallback classification will be used")
            continue
        }

        foreach ($pattern in $patternList) {
            if ($pattern -match "replace-with") {
                Add-Issue ("failure_patterns." + $patternKey + " still contains template values")
                break
            }
        }
    }

    if ($null -eq (Get-Command git -ErrorAction SilentlyContinue)) {
        Add-Issue "git command is not available"
    } else {
        $gitRepoCheck = Invoke-GitCommand -RootDir $rootDir -Arguments @("rev-parse", "--is-inside-work-tree") -AllowFailure
        if (-not $gitRepoCheck.Success -or $gitRepoCheck.Output.Trim() -ne "true") {
            Add-Issue "workspace is not a Git working tree"
        }
    }

    if ($null -ne $gitWorkflow) {
        foreach ($gitKey in @("hooks_path", "state_file", "reports_dir", "bootstrap_branch", "main_branch", "dev_branch", "feature_branch_prefix", "test_branch_prefix")) {
            $value = Get-ProjectObjectProperty -Object $gitWorkflow -Name $gitKey
            if ([string]::IsNullOrWhiteSpace($value)) {
                Add-Issue ("git_workflow." + $gitKey + " is empty")
            }
        }

        $hooksPath = $null
        try {
            $hooksPath = Get-GitWorkflowResolvedPath -RootDir $rootDir -Name "hooks_path"
            Ensure-HarnessDirectory -Path $hooksPath
        } catch {
            Add-Issue $_.Exception.Message
        }

        foreach ($scriptName in @(
                "audit_git_workflow.ps1",
                "run_git_gate.ps1",
                "assert_git_action_allowed.ps1",
                "authorize_branch_promotion.ps1",
                "request_main_merge_approval.ps1",
                "set_main_merge_approval.ps1",
                "install_git_hooks.ps1",
                "dispatch_seed_plan.ps1",
                "run_seed_handoff.ps1"
            )) {
            $scriptPath = Join-Path $PSScriptRoot $scriptName
            if (-not (Test-Path -LiteralPath $scriptPath)) {
                Add-Issue ("missing Git workflow script: harness/scripts/" + $scriptName)
            }
        }

        if ($null -ne $hooksPath) {
            foreach ($hookName in @("pre-commit", "pre-push", "pre-merge-commit", "pre-rebase")) {
                $hookPath = Join-Path $hooksPath $hookName
                if (-not (Test-Path -LiteralPath $hookPath)) {
                    Add-Issue ("missing Git hook: " + (Get-RelativeProjectPath -RootDir $rootDir -AbsolutePath $hookPath))
                }
            }

            $expectedHooksPath = [System.IO.Path]::GetFullPath($hooksPath).TrimEnd('\')
            $configuredHooksPath = Get-GitHooksPathSetting -RootDir $rootDir
            if ([string]::IsNullOrWhiteSpace($configuredHooksPath)) {
                Add-Issue "core.hooksPath is not configured; run harness/scripts/install_git_hooks.ps1"
            } else {
                $normalizedConfiguredHooksPath = $configuredHooksPath
                if (-not [System.IO.Path]::IsPathRooted($normalizedConfiguredHooksPath)) {
                    $normalizedConfiguredHooksPath = [System.IO.Path]::GetFullPath((Join-Path $rootDir $normalizedConfiguredHooksPath))
                } else {
                    $normalizedConfiguredHooksPath = [System.IO.Path]::GetFullPath($normalizedConfiguredHooksPath)
                }

                if ($normalizedConfiguredHooksPath.TrimEnd('\') -ne $expectedHooksPath) {
                    Add-Issue ("core.hooksPath does not match git_workflow.hooks_path: expected " + $expectedHooksPath + ", got " + $configuredHooksPath)
                }
            }
        }

        try {
            $statePath = Get-GitWorkflowResolvedPath -RootDir $rootDir -Name "state_file"
            if (-not (Test-WriteTarget -ResolvedPath $statePath)) {
                Add-Issue ("cannot write to git_workflow.state_file: " + $statePath)
            }
        } catch {
            Add-Issue $_.Exception.Message
        }

        try {
            $reportsPath = Get-GitWorkflowResolvedPath -RootDir $rootDir -Name "reports_dir"
            if (-not (Test-WriteTarget -ResolvedPath $reportsPath -AsDirectory)) {
                Add-Issue ("cannot write to git_workflow.reports_dir: " + $reportsPath)
            }
        } catch {
            Add-Issue $_.Exception.Message
        }

        try {
            $currentBranch = Get-GitCurrentBranch -RootDir $rootDir
            $currentBranchInfo = Get-GitBranchDescriptor -RootDir $rootDir -BranchName $currentBranch
            $activeGateStage = Get-ActiveGitGateStage
            $gitWorkflowState = Get-GitWorkflowState -RootDir $rootDir
            $auditIssues = @(Get-GitBranchAuditIssues -RootDir $rootDir -State $gitWorkflowState -BranchName $currentBranch)
            foreach ($auditIssue in $auditIssues) {
                if (Test-IsSelfReferentialGitGateAuditIssue -Issue $auditIssue -BranchKind $currentBranchInfo.Kind -ActiveGateStage $activeGateStage) {
                    continue
                }
                if (Test-IsPassingStagedFeatureGateAuditIssue -RootDirectory $rootDir -State $gitWorkflowState -BranchName $currentBranch -Issue $auditIssue -BranchKind $currentBranchInfo.Kind) {
                    continue
                }
                Add-Issue ("git workflow audit: " + $auditIssue)
            }
        } catch {
            Add-Issue ("git workflow audit failed: " + $_.Exception.Message)
        }
    }

    $gitIgnorePath = Join-Path $rootDir ".gitignore"
    if (-not (Test-Path -LiteralPath $gitIgnorePath)) {
        Add-Issue ".gitignore is missing; git workflow sealing depends on ignored generated artifacts"
    }

    if (-not (Test-Path -LiteralPath $generatedProfileDoc)) {
        Add-WarningEntry "docs/project_profile_generated.md is missing; run harness/scripts/generate_profile_docs.ps1"
    } else {
        $generatedTime = (Get-Item -LiteralPath $generatedProfileDoc).LastWriteTimeUtc
        $profileTime = (Get-Item -LiteralPath $profilePath).LastWriteTimeUtc
        if ($generatedTime -lt $profileTime) {
            Add-WarningEntry "docs/project_profile_generated.md is older than project_profile.json; regenerate it"
        }
    }
}

$status = "pass"
if ($issues.Count -gt 0) {
    $status = "fail"
}

$issueLines = "- none"
if ($issues.Count -gt 0) {
    $issueLines = ($issues | ForEach-Object { "- $_" }) -join [Environment]::NewLine
}

$warningLines = "- none"
if ($warnings.Count -gt 0) {
    $warningLines = ($warnings | ForEach-Object { "- $_" }) -join [Environment]::NewLine
}

$report = @"
# Harness Preflight Report

## Summary

- status: $status
- profile: $profilePath

## Issues

$issueLines

## Warnings

$warningLines
"@

Write-Utf8File -Path $reportPath -Content $report
$recordPath = Write-TestResultRecord -RootDir $rootDir -Suite "preflight" -Status $status -Summary "Validated project profile, source docs, owner mappings, and command availability." -Metadata @{
    profile = $profilePath
    issues = $issues.Count
    warnings = $warnings.Count
} -Artifacts @($reportPath, $profilePath)

if (-not $Quiet) {
    Write-Output "preflight status: $status"
    Write-Output "preflight report: $reportPath"
    Write-Output "preflight record: $recordPath"
}

if ($status -ne "pass") {
    exit 1
}

exit 0
