$script:GitWorkflowStateCache = @{}

function Get-GitWorkflowConfig {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $profile = Get-ProjectProfile -RootDir $RootDir
    $config = Get-ProjectObjectProperty -Object $profile -Name "git_workflow"

    $hooksPath = Get-ProjectObjectProperty -Object $config -Name "hooks_path"
    if ([string]::IsNullOrWhiteSpace($hooksPath)) {
        $hooksPath = ".githooks"
    }

    $stateFile = Get-ProjectObjectProperty -Object $config -Name "state_file"
    if ([string]::IsNullOrWhiteSpace($stateFile)) {
        $stateFile = "harness/state/git_workflow/state.json"
    }

    $reportsDir = Get-ProjectObjectProperty -Object $config -Name "reports_dir"
    if ([string]::IsNullOrWhiteSpace($reportsDir)) {
        $reportsDir = "harness/reports/git_workflow"
    }

    $bootstrapBranch = Get-ProjectObjectProperty -Object $config -Name "bootstrap_branch"
    if ([string]::IsNullOrWhiteSpace($bootstrapBranch)) {
        $bootstrapBranch = "main"
    }

    $mainBranch = Get-ProjectObjectProperty -Object $config -Name "main_branch"
    if ([string]::IsNullOrWhiteSpace($mainBranch)) {
        $mainBranch = "main"
    }

    $devBranch = Get-ProjectObjectProperty -Object $config -Name "dev_branch"
    if ([string]::IsNullOrWhiteSpace($devBranch)) {
        $devBranch = "dev"
    }

    $featurePrefix = Get-ProjectObjectProperty -Object $config -Name "feature_branch_prefix"
    if ([string]::IsNullOrWhiteSpace($featurePrefix)) {
        $featurePrefix = "codex/"
    }

    $testPrefix = Get-ProjectObjectProperty -Object $config -Name "test_branch_prefix"
    if ([string]::IsNullOrWhiteSpace($testPrefix)) {
        $testPrefix = "codex/test/"
    }

    return [pscustomobject]@{
        HooksPath = [string]$hooksPath
        StateFile = [string]$stateFile
        ReportsDir = [string]$reportsDir
        BootstrapBranch = [string]$bootstrapBranch
        MainBranch = [string]$mainBranch
        DevBranch = [string]$devBranch
        FeatureBranchPrefix = [string]$featurePrefix
        TestBranchPrefix = [string]$testPrefix
    }
}

function Get-GitWorkflowResolvedPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [ValidateSet("hooks_path", "state_file", "reports_dir")]
        [string]$Name
    )

    $config = Get-GitWorkflowConfig -RootDir $RootDir
    switch ($Name) {
        "hooks_path" {
            return Resolve-ProjectPath -RootDir $RootDir -ProjectPath $config.HooksPath -Label "git_workflow.hooks_path"
        }
        "state_file" {
            return Resolve-ProjectPath -RootDir $RootDir -ProjectPath $config.StateFile -Label "git_workflow.state_file"
        }
        "reports_dir" {
            return Resolve-ProjectPath -RootDir $RootDir -ProjectPath $config.ReportsDir -Label "git_workflow.reports_dir"
        }
    }
}

function New-GitWorkflowState {
    return [ordered]@{
        version = 1
        updated_at = ""
        validations = @()
        promotions = @()
        approvals = @()
    }
}

function Normalize-GitWorkflowState {
    param(
        [AllowNull()]
        $State
    )

    if ($null -eq $State) {
        $State = [pscustomobject](New-GitWorkflowState)
    }

    foreach ($propertyName in @("version", "updated_at", "validations", "promotions", "approvals")) {
        if ($null -eq $State.PSObject.Properties[$propertyName]) {
            Add-Member -InputObject $State -NotePropertyName $propertyName -NotePropertyValue $null
        }
    }

    if ($null -eq $State.version) {
        $State.version = 1
    }

    if ($null -eq $State.updated_at) {
        $State.updated_at = ""
    }

    foreach ($collectionName in @("validations", "promotions", "approvals")) {
        $collection = $State.$collectionName
        if ($null -eq $collection) {
            $State.$collectionName = @()
            continue
        }

        $State.$collectionName = @($collection)
    }

    return $State
}

function Get-GitWorkflowState {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $statePath = Get-GitWorkflowResolvedPath -RootDir $RootDir -Name "state_file"
    if ($script:GitWorkflowStateCache.ContainsKey($statePath)) {
        return $script:GitWorkflowStateCache[$statePath]
    }

    $state = $null
    if (Test-Path -LiteralPath $statePath) {
        $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    }

    $state = Normalize-GitWorkflowState -State $state
    $script:GitWorkflowStateCache[$statePath] = $state
    return $state
}

function Save-GitWorkflowState {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        $State
    )

    $normalizedState = Normalize-GitWorkflowState -State $State
    $normalizedState.updated_at = (Get-Date).ToString("o")

    $statePath = Get-GitWorkflowResolvedPath -RootDir $RootDir -Name "state_file"
    $stateDir = Split-Path -Parent $statePath
    Ensure-HarnessDirectory -Path $stateDir

    $json = $normalizedState | ConvertTo-Json -Depth 10
    Write-Utf8File -Path $statePath -Content $json
    $script:GitWorkflowStateCache[$statePath] = $normalizedState
    return $statePath
}

function New-GitWorkflowRecordId {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Prefix
    )

    return ($Prefix + "_" + (Get-Date -Format "yyyyMMdd_HHmmss_fff") + "_" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
}

function Write-GitWorkflowReport {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$Prefix,
        [Parameter(Mandatory = $true)]
        [string]$Content,
        [string]$Extension = ".md"
    )

    $reportsDir = Get-GitWorkflowResolvedPath -RootDir $RootDir -Name "reports_dir"
    Ensure-HarnessDirectory -Path $reportsDir

    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"
    $safePrefix = ($Prefix -replace "[^A-Za-z0-9_-]", "_")
    $path = Join-Path $reportsDir ($timestamp + "_" + $safePrefix + $Extension)
    Write-Utf8File -Path $path -Content $Content
    return $path
}

function Invoke-GitCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $gitRoot = [Environment]::GetEnvironmentVariable("CODEX_GIT_WORKSPACE_ROOT")
    if ([string]::IsNullOrWhiteSpace($gitRoot)) {
        $gitRoot = $RootDir
    }
    $gitRoot = [System.IO.Path]::GetFullPath($gitRoot)

    $cmdParts = @("git", "-C", ('"' + $gitRoot.Replace('"', '\"') + '"'))
    foreach ($argument in $Arguments) {
        if ([string]::IsNullOrWhiteSpace($argument)) {
            $cmdParts += '""'
            continue
        }

        if ($argument -match '[\s"]') {
            $cmdParts += ('"' + $argument.Replace('"', '\"') + '"')
        } else {
            $cmdParts += $argument
        }
    }

    $commandText = $cmdParts -join " "
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & cmd.exe /d /s /c $commandText 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    $text = ($output | Out-String).TrimEnd()

    if (-not $AllowFailure -and $exitCode -ne 0) {
        if ([string]::IsNullOrWhiteSpace($text)) {
            throw "git command failed: $commandText"
        }

        throw "git command failed: $commandText`n$text"
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Success = ($exitCode -eq 0)
        Output = $text
    }
}

function Get-GitAssignmentWorktreeRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    return Get-HarnessConfiguredPath -RootDir $RootDir -Name "assignment_worktrees_root" -FallbackRelativePath "harness/state/worktrees"
}

function Get-GitManagedWorktreePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$Category,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    $worktreeRoot = Get-GitAssignmentWorktreeRoot -RootDir $RootDir
    $safeCategory = Assert-SafePathToken -Token $Category -Label "worktree category"
    $safeToken = Get-GitSafeBranchToken -Value $Token
    $categoryDir = Join-Path $worktreeRoot $safeCategory
    Ensure-HarnessDirectory -Path $categoryDir
    return (Join-Path $categoryDir $safeToken)
}

function Get-GitAssignmentWorktreePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$Owner,
        [Parameter(Mandatory = $true)]
        [string]$AssignmentId
    )

    $worktreeRoot = Get-GitAssignmentWorktreeRoot -RootDir $RootDir
    $safeOwner = Assert-SafePathToken -Token $Owner -Label "owner"
    $safeAssignment = Get-GitSafeBranchToken -Value $AssignmentId
    $ownerDir = Join-Path $worktreeRoot $safeOwner
    Ensure-HarnessDirectory -Path $ownerDir
    return (Join-Path $ownerDir $safeAssignment)
}

function Get-GitWorktreeRecords {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("worktree", "list", "--porcelain") -AllowFailure
    if (-not $result.Success -or [string]::IsNullOrWhiteSpace($result.Output)) {
        return @()
    }

    $records = New-Object System.Collections.Generic.List[object]
    $current = [ordered]@{}
    foreach ($line in ($result.Output -split "\r?\n")) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            if ($current.Contains("worktree")) {
                $records.Add([pscustomobject]@{
                        WorktreePath = [string]$current["worktree"]
                        Head = [string]$current["HEAD"]
                        BranchRef = [string]$current["branch"]
                        BranchName = $(if ([string]::IsNullOrWhiteSpace([string]$current["branch"])) { "" } else { Get-GitBranchNameFromRef -RefName ([string]$current["branch"]) })
                    }) | Out-Null
            }
            $current = [ordered]@{}
            continue
        }

        if ($line.StartsWith("worktree ")) {
            if ($current.Contains("worktree")) {
                $records.Add([pscustomobject]@{
                        WorktreePath = [string]$current["worktree"]
                        Head = [string]$current["HEAD"]
                        BranchRef = [string]$current["branch"]
                        BranchName = $(if ([string]::IsNullOrWhiteSpace([string]$current["branch"])) { "" } else { Get-GitBranchNameFromRef -RefName ([string]$current["branch"]) })
                    }) | Out-Null
                $current = [ordered]@{}
            }

            $current["worktree"] = $line.Substring("worktree ".Length).Trim()
            continue
        }

        if ($line.StartsWith("HEAD ")) {
            $current["HEAD"] = $line.Substring("HEAD ".Length).Trim()
            continue
        }

        if ($line.StartsWith("branch ")) {
            $current["branch"] = $line.Substring("branch ".Length).Trim()
            continue
        }
    }

    if ($current.Contains("worktree")) {
        $records.Add([pscustomobject]@{
                WorktreePath = [string]$current["worktree"]
                Head = [string]$current["HEAD"]
                BranchRef = [string]$current["branch"]
                BranchName = $(if ([string]::IsNullOrWhiteSpace([string]$current["branch"])) { "" } else { Get-GitBranchNameFromRef -RefName ([string]$current["branch"]) })
            }) | Out-Null
    }

    return $records.ToArray()
}

function Ensure-GitAssignmentWorktree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$Owner,
        [Parameter(Mandatory = $true)]
        [string]$AssignmentId
    )

    $expectedBranch = Get-GitExpectedAssignmentBranch -RootDir $RootDir -Owner $Owner -AssignmentId $AssignmentId
    $worktreePath = Get-GitAssignmentWorktreePath -RootDir $RootDir -Owner $Owner -AssignmentId $AssignmentId
    $baseBranch = Get-GitAssignmentBaseBranch -RootDir $RootDir
    return Ensure-GitBranchWorktree -RootDir $RootDir -BranchName $expectedBranch -WorktreePath $worktreePath -BaseBranch $baseBranch
}

function Ensure-GitBranchWorktree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$BranchName,
        [Parameter(Mandatory = $true)]
        [string]$WorktreePath,
        [string]$BaseBranch = ""
    )

    $expectedBranch = $BranchName
    $worktreeRecords = @(Get-GitWorktreeRecords -RootDir $RootDir)
    $existingBranchRecord = $worktreeRecords | Where-Object { $_.BranchName -eq $expectedBranch } | Select-Object -First 1
    if ($null -ne $existingBranchRecord) {
        return [pscustomobject]@{
            ExpectedBranch = $expectedBranch
            WorktreePath = [System.IO.Path]::GetFullPath($existingBranchRecord.WorktreePath)
            CreatedWorktree = $false
            CreatedBranch = $false
            BaseBranch = ""
            ReusedExisting = $true
        }
    }

    if (Test-Path -LiteralPath $worktreePath) {
        $existingPathRecord = $worktreeRecords | Where-Object {
            [System.IO.Path]::GetFullPath($_.WorktreePath).TrimEnd('\') -eq [System.IO.Path]::GetFullPath($worktreePath).TrimEnd('\')
        } | Select-Object -First 1
        if ($null -ne $existingPathRecord) {
            return [pscustomobject]@{
                ExpectedBranch = $(if ([string]::IsNullOrWhiteSpace($existingPathRecord.BranchName)) { $expectedBranch } else { $existingPathRecord.BranchName })
                WorktreePath = [System.IO.Path]::GetFullPath($existingPathRecord.WorktreePath)
                CreatedWorktree = $false
                CreatedBranch = $false
                BaseBranch = ""
                ReusedExisting = $true
            }
        }

        throw "assignment worktree path already exists but is not registered with git worktree: $worktreePath"
    }

    $branchCommit = Get-GitBranchCommit -RootDir $RootDir -BranchName $expectedBranch
    $createdBranch = $false
    $baseBranch = ""
    if ([string]::IsNullOrWhiteSpace($branchCommit)) {
        if ([string]::IsNullOrWhiteSpace($BaseBranch)) {
            $config = Get-GitWorkflowConfig -RootDir $RootDir
            $branchInfo = Get-GitBranchDescriptor -RootDir $RootDir -BranchName $expectedBranch
            if ($expectedBranch -eq $config.DevBranch) {
                $BaseBranch = $config.MainBranch
            } elseif ($branchInfo.Kind -eq "test") {
                $BaseBranch = $config.DevBranch
            } else {
                $BaseBranch = Get-GitAssignmentBaseBranch -RootDir $RootDir
            }
        }

        Invoke-GitCommand -RootDir $RootDir -Arguments @("worktree", "add", "-b", $expectedBranch, $worktreePath, $BaseBranch) | Out-Null
        $createdBranch = $true
        $baseBranch = $BaseBranch
    } else {
        Invoke-GitCommand -RootDir $RootDir -Arguments @("worktree", "add", $worktreePath, $expectedBranch) | Out-Null
    }

    return [pscustomobject]@{
        ExpectedBranch = $expectedBranch
        WorktreePath = [System.IO.Path]::GetFullPath($worktreePath)
        CreatedWorktree = $true
        CreatedBranch = $createdBranch
        BaseBranch = $baseBranch
        ReusedExisting = $false
    }
}

function Test-GitHeadExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("rev-parse", "--verify", "HEAD") -AllowFailure
    return $result.Success
}

function Get-GitCurrentBranch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("branch", "--show-current")
    $branchName = $result.Output.Trim()
    if ([string]::IsNullOrWhiteSpace($branchName)) {
        throw "unable to resolve current branch name"
    }

    return $branchName
}

function Get-GitHeadCommit {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    if (-not (Test-GitHeadExists -RootDir $RootDir)) {
        return ""
    }

    return (Invoke-GitCommand -RootDir $RootDir -Arguments @("rev-parse", "HEAD")).Output.Trim()
}

function Get-GitCommitTree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$Commitish
    )

    if ([string]::IsNullOrWhiteSpace($Commitish)) {
        return ""
    }

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("show", "-s", "--format=%T", $Commitish) -AllowFailure
    if (-not $result.Success) {
        return ""
    }

    return $result.Output.Trim()
}

function Get-GitHeadTree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $headCommit = Get-GitHeadCommit -RootDir $RootDir
    if ([string]::IsNullOrWhiteSpace($headCommit)) {
        return ""
    }

    return Get-GitCommitTree -RootDir $RootDir -Commitish $headCommit
}

function Get-GitBranchCommit {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$BranchName
    )

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("show-ref", "--verify", "--hash", ("refs/heads/" + $BranchName)) -AllowFailure
    if (-not $result.Success) {
        return ""
    }

    return $result.Output.Trim()
}

function Get-GitBranchTree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$BranchName
    )

    $branchCommit = Get-GitBranchCommit -RootDir $RootDir -BranchName $BranchName
    if ([string]::IsNullOrWhiteSpace($branchCommit)) {
        return ""
    }

    return Get-GitCommitTree -RootDir $RootDir -Commitish $branchCommit
}

function Get-GitIndexTree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    return (Invoke-GitCommand -RootDir $RootDir -Arguments @("write-tree")).Output.Trim()
}

function Get-GitStatusAnalysis {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $statusResult = Invoke-GitCommand -RootDir $RootDir -Arguments @("status", "--porcelain=v1", "--untracked-files=all")
    $lines = @()
    if (-not [string]::IsNullOrWhiteSpace($statusResult.Output)) {
        $lines = @($statusResult.Output -split "\r?\n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }

    $issues = New-Object System.Collections.Generic.List[string]
    $hasStagedChanges = $false
    $hasUnstagedChanges = $false
    $hasUntrackedChanges = $false
    $hasConflicts = $false

    foreach ($line in $lines) {
        if ($line.Length -lt 3) {
            continue
        }

        $xy = $line.Substring(0, 2)
        $path = $line.Substring(3).Trim()

        if ($xy -eq "??") {
            $hasUntrackedChanges = $true
            $issues.Add("untracked path: $path") | Out-Null
            continue
        }

        $x = $xy[0]
        $y = $xy[1]

        if ($x -ne ' ') {
            $hasStagedChanges = $true
        }

        if ($y -ne ' ') {
            $hasUnstagedChanges = $true
            $issues.Add("unstaged path: $path") | Out-Null
        }

        if ($x -eq 'U' -or $y -eq 'U' -or $xy -eq "AA" -or $xy -eq "DD") {
            $hasConflicts = $true
            $issues.Add("merge conflict path: $path") | Out-Null
        }
    }

    return [pscustomobject]@{
        Lines = $lines
        Issues = @($issues)
        HasStagedChanges = $hasStagedChanges
        HasUnstagedChanges = $hasUnstagedChanges
        HasUntrackedChanges = $hasUntrackedChanges
        HasConflicts = $hasConflicts
    }
}

function Assert-SealedGitCandidate {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [switch]$RequireStagedChanges
    )

    $analysis = Get-GitStatusAnalysis -RootDir $RootDir
    $blockingIssues = New-Object System.Collections.Generic.List[string]

    if ($analysis.HasConflicts) {
        foreach ($issue in $analysis.Issues | Where-Object { $_ -like "merge conflict*" }) {
            $blockingIssues.Add($issue) | Out-Null
        }
    }

    if ($analysis.HasUntrackedChanges) {
        foreach ($issue in $analysis.Issues | Where-Object { $_ -like "untracked path:*" }) {
            $blockingIssues.Add($issue) | Out-Null
        }
    }

    if ($analysis.HasUnstagedChanges) {
        foreach ($issue in $analysis.Issues | Where-Object { $_ -like "unstaged path:*" }) {
            $blockingIssues.Add($issue) | Out-Null
        }
    }

    if ($RequireStagedChanges -and -not $analysis.HasStagedChanges) {
        $blockingIssues.Add("no staged changes are present for the candidate tree") | Out-Null
    }

    if ($blockingIssues.Count -gt 0) {
        throw ("candidate tree is not sealed:`n- " + ($blockingIssues -join ([Environment]::NewLine + "- ")))
    }

    return $analysis
}

function Get-GitHooksPathSetting {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("config", "--local", "--get", "core.hooksPath") -AllowFailure
    if (-not $result.Success) {
        return ""
    }

    return $result.Output.Trim()
}

function Get-GitBranchDescriptor {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [string]$BranchName = ""
    )

    $profile = Get-ProjectProfile -RootDir $RootDir
    $owners = Get-ProjectObjectProperty -Object $profile -Name "owners"
    $ownerNames = @()
    if ($null -ne $owners) {
        $ownerNames = @($owners.PSObject.Properties.Name)
    }

    $config = Get-GitWorkflowConfig -RootDir $RootDir
    if ([string]::IsNullOrWhiteSpace($BranchName)) {
        $BranchName = Get-GitCurrentBranch -RootDir $RootDir
    }

    $kind = "unknown"
    $owner = ""
    $isProtected = $false

    if ($BranchName -eq $config.MainBranch) {
        $kind = "main"
        $isProtected = $true
    } elseif ($BranchName -eq $config.DevBranch) {
        $kind = "dev"
        $isProtected = $true
    } elseif ($BranchName.StartsWith($config.TestBranchPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $kind = "test"
        $isProtected = $true
    } elseif ($BranchName.StartsWith($config.FeatureBranchPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $remainder = $BranchName.Substring($config.FeatureBranchPrefix.Length)
        $segments = @($remainder -split "/" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($segments.Count -ge 2 -and $ownerNames -contains $segments[0]) {
            $kind = "feature"
            $owner = $segments[0]
        }
    }

    return [pscustomobject]@{
        Name = $BranchName
        Kind = $kind
        Owner = $owner
        IsProtected = $isProtected
        SupportsBootstrap = ($BranchName -eq $config.BootstrapBranch)
    }
}

function Get-GitSafeBranchToken {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $token = $Value.ToLowerInvariant() -replace "[^a-z0-9/_-]", "-"
    $token = $token -replace "-{2,}", "-"
    $token = $token.Trim('-', '/')
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "cannot derive a safe branch token from value: $Value"
    }

    return $token
}

function Get-GitExpectedAssignmentBranch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$Owner,
        [Parameter(Mandatory = $true)]
        [string]$AssignmentId
    )

    $config = Get-GitWorkflowConfig -RootDir $RootDir
    $taskToken = Get-GitSafeBranchToken -Value $AssignmentId
    return ($config.FeatureBranchPrefix + $Owner + "/" + $taskToken)
}

function Get-GitAssignmentBaseBranch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $config = Get-GitWorkflowConfig -RootDir $RootDir
    foreach ($candidate in @($config.MainBranch, $config.BootstrapBranch)) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }

        $branchCommit = Get-GitBranchCommit -RootDir $RootDir -BranchName $candidate
        if (-not [string]::IsNullOrWhiteSpace($branchCommit)) {
            return $candidate
        }
    }

    throw "cannot create an assignment branch because neither '$($config.MainBranch)' nor '$($config.BootstrapBranch)' exists locally"
}

function Ensure-GitAssignmentBranch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$Owner,
        [Parameter(Mandatory = $true)]
        [string]$AssignmentId
    )

    $expectedBranch = Get-GitExpectedAssignmentBranch -RootDir $RootDir -Owner $Owner -AssignmentId $AssignmentId
    $currentBranch = Get-GitCurrentBranch -RootDir $RootDir
    if ($currentBranch -eq $expectedBranch) {
        return [pscustomobject]@{
            ExpectedBranch = $expectedBranch
            PreviousBranch = $currentBranch
            CurrentBranch = $currentBranch
            Switched = $false
            Created = $false
            BaseBranch = ""
        }
    }

    $analysis = Get-GitStatusAnalysis -RootDir $RootDir
    if ($analysis.Lines.Count -gt 0) {
        throw "cannot switch to assignment branch '$expectedBranch' because the worktree is not clean"
    }

    $branchCommit = Get-GitBranchCommit -RootDir $RootDir -BranchName $expectedBranch
    $created = $false
    $baseBranch = ""
    if ([string]::IsNullOrWhiteSpace($branchCommit)) {
        $baseBranch = Get-GitAssignmentBaseBranch -RootDir $RootDir
        Invoke-GitCommand -RootDir $RootDir -Arguments @("switch", "-c", $expectedBranch, $baseBranch) | Out-Null
        $created = $true
    } else {
        Invoke-GitCommand -RootDir $RootDir -Arguments @("switch", $expectedBranch) | Out-Null
    }

    $resolvedBranch = Get-GitCurrentBranch -RootDir $RootDir
    if ($resolvedBranch -ne $expectedBranch) {
        throw "failed to switch to assignment branch '$expectedBranch'"
    }

    return [pscustomobject]@{
        ExpectedBranch = $expectedBranch
        PreviousBranch = $currentBranch
        CurrentBranch = $resolvedBranch
        Switched = $true
        Created = $created
        BaseBranch = $baseBranch
    }
}

function Get-GitCommitParents {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$Commit
    )

    if ([string]::IsNullOrWhiteSpace($Commit)) {
        return @()
    }

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("rev-list", "--parents", "-n", "1", $Commit) -AllowFailure
    if (-not $result.Success -or [string]::IsNullOrWhiteSpace($result.Output)) {
        return @()
    }

    $tokens = @($result.Output.Trim() -split "\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($tokens.Count -le 1) {
        return @()
    }

    return @($tokens[1..($tokens.Count - 1)])
}

function Get-GitMergeHeadCommit {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("rev-parse", "--verify", "MERGE_HEAD") -AllowFailure
    if (-not $result.Success) {
        return ""
    }

    return $result.Output.Trim()
}

function Get-GitPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$PathName
    )

    $result = Invoke-GitCommand -RootDir $RootDir -Arguments @("rev-parse", "--git-path", $PathName) -AllowFailure
    if (-not $result.Success -or [string]::IsNullOrWhiteSpace($result.Output)) {
        return ""
    }

    return $result.Output.Trim()
}

function Get-GitDirectoryPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $dotGitPath = Join-Path $RootDir ".git"
    if (Test-Path -LiteralPath $dotGitPath -PathType Container) {
        return [System.IO.Path]::GetFullPath($dotGitPath)
    }

    if (-not (Test-Path -LiteralPath $dotGitPath -PathType Leaf)) {
        return ""
    }

    $gitFileLine = ""
    foreach ($line in (Get-Content -LiteralPath $dotGitPath -ErrorAction SilentlyContinue)) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $gitFileLine = $line.Trim()
            break
        }
    }

    if ([string]::IsNullOrWhiteSpace($gitFileLine) -or -not $gitFileLine.StartsWith("gitdir:", [System.StringComparison]::OrdinalIgnoreCase)) {
        return ""
    }

    $gitDirValue = $gitFileLine.Substring("gitdir:".Length).Trim()
    if ([string]::IsNullOrWhiteSpace($gitDirValue)) {
        return ""
    }

    if ([System.IO.Path]::IsPathRooted($gitDirValue)) {
        return [System.IO.Path]::GetFullPath($gitDirValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $RootDir $gitDirValue))
}

function Get-GitDirectoryFileFirstLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$FileName
    )

    $gitDirPath = Get-GitDirectoryPath -RootDir $RootDir
    if ([string]::IsNullOrWhiteSpace($gitDirPath)) {
        return ""
    }

    $filePath = Join-Path $gitDirPath $FileName
    if (-not (Test-Path -LiteralPath $filePath)) {
        return ""
    }

    foreach ($line in (Get-Content -LiteralPath $filePath -ErrorAction SilentlyContinue)) {
        if ($null -ne $line) {
            return ([string]$line).Trim()
        }
    }

    return ""
}

function Get-GitPendingMergeSourceBranch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $mergeMsg = Get-GitDirectoryFileFirstLine -RootDir $RootDir -FileName "MERGE_MSG"
    if ([string]::IsNullOrWhiteSpace($mergeMsg)) {
        return ""
    }

    $match = [System.Text.RegularExpressions.Regex]::Match(
        $mergeMsg,
        "^Merge branch '([^']+)'(?: into .+)?$"
    )
    if ($match.Success) {
        return $match.Groups[1].Value.Trim()
    }

    return ""
}

function Get-GitPendingMergeHeadCommit {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir
    )

    $gitDirPath = Get-GitDirectoryPath -RootDir $RootDir
    if (-not [string]::IsNullOrWhiteSpace($gitDirPath)) {
        $mergeHeadFile = Join-Path $gitDirPath "MERGE_HEAD"
        if (Test-Path -LiteralPath $mergeHeadFile) {
            foreach ($line in (Get-Content -LiteralPath $mergeHeadFile -ErrorAction SilentlyContinue)) {
                if (-not [string]::IsNullOrWhiteSpace($line)) {
                    $candidate = $line.Trim()
                    if ($candidate -match '^[0-9a-fA-F]{40}$') {
                        return $candidate.ToLowerInvariant()
                    }
                    break
                }
            }
        }
    }

    $mergeHead = Get-GitMergeHeadCommit -RootDir $RootDir
    if (-not [string]::IsNullOrWhiteSpace($mergeHead)) {
        return $mergeHead
    }

    $mergeHeadPath = Get-GitPath -RootDir $RootDir -PathName "MERGE_HEAD"
    if ([string]::IsNullOrWhiteSpace($mergeHeadPath) -or -not (Test-Path -LiteralPath $mergeHeadPath)) {
        return ""
    }

    $firstLine = ""
    foreach ($line in (Get-Content -LiteralPath $mergeHeadPath -ErrorAction SilentlyContinue)) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $firstLine = $line.Trim()
            break
        }
    }

    if ($firstLine -match '^[0-9a-fA-F]{40}$') {
        return $firstLine.ToLowerInvariant()
    }

    return ""
}

function Invoke-LoggedShellCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        [string]$CommandText,
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    $resolvedCommandText = $CommandText
    if ($resolvedCommandText -match '(^|\s)make(?=\s|$)' -and
        $null -eq (Get-Command make -ErrorAction SilentlyContinue) -and
        $null -ne (Get-Command mingw32-make -ErrorAction SilentlyContinue)) {
        $resolvedCommandText = [System.Text.RegularExpressions.Regex]::Replace(
            $resolvedCommandText,
            '(^|\s)make(?=\s|$)',
            '${1}mingw32-make'
        )
    }

    Push-Location $RootDir
    try {
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $output = & cmd.exe /d /s /c $resolvedCommandText 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousPreference
        }
        $text = ($output | Out-String)
        Write-Utf8File -Path $LogPath -Content $text
        return [pscustomobject]@{
            ExitCode = $exitCode
            Success = ($exitCode -eq 0)
            Output = $text.TrimEnd()
        }
    } finally {
        Pop-Location
    }
}

function Get-LatestGitValidation {
    param(
        [Parameter(Mandatory = $true)]
        $State,
        [string]$Branch = "",
        [string]$Stage = "",
        [string]$Status = "",
        [string]$TreeHash = ""
    )

    $matches = @($State.validations | Where-Object {
            ([string]::IsNullOrWhiteSpace($Branch) -or $_.branch -eq $Branch) -and
            ([string]::IsNullOrWhiteSpace($Stage) -or $_.stage -eq $Stage) -and
            ([string]::IsNullOrWhiteSpace($Status) -or $_.status -eq $Status) -and
            ([string]::IsNullOrWhiteSpace($TreeHash) -or $_.tree_hash -eq $TreeHash)
        } | Sort-Object executed_at -Descending)

    if ($matches.Count -eq 0) {
        return $null
    }

    return $matches[0]
}

function Get-GitValidationHint {
    param(
        [Parameter(Mandatory = $true)]
        $State,
        [Parameter(Mandatory = $true)]
        [string]$Stage,
        [Parameter(Mandatory = $true)]
        [string]$Status,
        [Parameter(Mandatory = $true)]
        [string]$TreeHash,
        [string]$ExcludedBranch = ""
    )

    if ([string]::IsNullOrWhiteSpace($TreeHash)) {
        return ""
    }

    $matches = @($State.validations | Where-Object {
            $_.stage -eq $Stage -and
            $_.status -eq $Status -and
            $_.tree_hash -eq $TreeHash -and
            ([string]::IsNullOrWhiteSpace($ExcludedBranch) -or $_.branch -ne $ExcludedBranch)
        } | Sort-Object executed_at -Descending)

    if ($matches.Count -eq 0) {
        return ""
    }

    $latest = $matches[0]
    return "matching $Stage gate exists for branch '$($latest.branch)' at the same tree hash; switch to that branch, rerun this gate on the current branch, or remove the duplicate branch if it was created by mistake"
}

function Get-ActiveGitGateStage {
    $stage = [Environment]::GetEnvironmentVariable("CODEX_ACTIVE_GIT_GATE_STAGE", "Process")
    if ([string]::IsNullOrWhiteSpace($stage)) {
        return ""
    }

    return $stage.Trim().ToLowerInvariant()
}

function Get-LatestGitPromotion {
    param(
        [Parameter(Mandatory = $true)]
        $State,
        [string]$SourceBranch = "",
        [string]$SourceHead = "",
        [string]$TargetBranch = "",
        [string]$Status = ""
    )

    $matches = @($State.promotions | Where-Object {
            ([string]::IsNullOrWhiteSpace($SourceBranch) -or $_.source_branch -eq $SourceBranch) -and
            ([string]::IsNullOrWhiteSpace($SourceHead) -or $_.source_head -eq $SourceHead) -and
            ([string]::IsNullOrWhiteSpace($TargetBranch) -or $_.target_branch -eq $TargetBranch) -and
            ([string]::IsNullOrWhiteSpace($Status) -or $_.status -eq $Status)
        } | Sort-Object authorized_at -Descending)

    if ($matches.Count -eq 0) {
        return $null
    }

    return $matches[0]
}

function Get-GitApprovalRecord {
    param(
        [Parameter(Mandatory = $true)]
        $State,
        [string]$ApprovalId = "",
        [string]$SourceBranch = "",
        [string]$SourceHead = "",
        [string]$Status = ""
    )

    $matches = @($State.approvals | Where-Object {
            ([string]::IsNullOrWhiteSpace($ApprovalId) -or $_.id -eq $ApprovalId) -and
            ([string]::IsNullOrWhiteSpace($SourceBranch) -or $_.source_branch -eq $SourceBranch) -and
            ([string]::IsNullOrWhiteSpace($SourceHead) -or $_.source_head -eq $SourceHead) -and
            ([string]::IsNullOrWhiteSpace($Status) -or $_.status -eq $Status)
        } | Sort-Object requested_at -Descending)

    if ($matches.Count -eq 0) {
        return $null
    }

    return $matches[0]
}

function Test-GitZeroObjectId {
    param(
        [AllowNull()]
        [string]$Sha
    )

    if ([string]::IsNullOrWhiteSpace($Sha)) {
        return $true
    }

    return ($Sha -match "^[0]{40}$")
}

function Get-GitBranchNameFromRef {
    param(
        [AllowNull()]
        [string]$RefName
    )

    if ([string]::IsNullOrWhiteSpace($RefName)) {
        return ""
    }

    if ($RefName.StartsWith("refs/heads/", [System.StringComparison]::OrdinalIgnoreCase)) {
        return $RefName.Substring("refs/heads/".Length)
    }

    return ""
}

function Get-GitPushRefUpdates {
    param(
        [string]$RefUpdateFile
    )

    if ([string]::IsNullOrWhiteSpace($RefUpdateFile) -or -not (Test-Path -LiteralPath $RefUpdateFile)) {
        return @()
    }

    $records = New-Object System.Collections.Generic.List[object]
    foreach ($line in (Get-Content -LiteralPath $RefUpdateFile)) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $parts = @($line -split "\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($parts.Count -lt 4) {
            continue
        }

        $localRef = [string]$parts[0]
        $localSha = [string]$parts[1]
        $remoteRef = [string]$parts[2]
        $remoteSha = [string]$parts[3]

        $records.Add([pscustomobject]@{
                LocalRef = $localRef
                LocalSha = $localSha
                RemoteRef = $remoteRef
                RemoteSha = $remoteSha
                LocalBranch = Get-GitBranchNameFromRef -RefName $localRef
                RemoteBranch = Get-GitBranchNameFromRef -RefName $remoteRef
                IsDelete = (($localRef -eq "(delete)") -or (Test-GitZeroObjectId -Sha $localSha))
                IsCreate = (Test-GitZeroObjectId -Sha $remoteSha)
            }) | Out-Null
    }

    return $records.ToArray()
}

function Get-GitBranchAuditIssues {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [Parameter(Mandatory = $true)]
        $State,
        [Parameter(Mandatory = $true)]
        [string]$BranchName,
        [string]$Commit = ""
    )

    $issues = New-Object System.Collections.Generic.List[string]
    $config = Get-GitWorkflowConfig -RootDir $RootDir
    $branchInfo = Get-GitBranchDescriptor -RootDir $RootDir -BranchName $BranchName

    if ([string]::IsNullOrWhiteSpace($Commit)) {
        $Commit = Get-GitBranchCommit -RootDir $RootDir -BranchName $BranchName
    }

    if ([string]::IsNullOrWhiteSpace($Commit)) {
        return @()
    }

    $treeHash = Get-GitCommitTree -RootDir $RootDir -Commitish $Commit
    if ([string]::IsNullOrWhiteSpace($treeHash)) {
        $issues.Add("cannot resolve tree hash for branch '$BranchName' at commit $Commit") | Out-Null
        return @($issues)
    }

    switch ($branchInfo.Kind) {
        "feature" {
            $validation = Get-LatestGitValidation -State $State -Branch $BranchName -Stage "feature" -Status "pass" -TreeHash $treeHash
            if ($null -eq $validation) {
                $hint = Get-GitValidationHint -State $State -Stage "feature" -Status "pass" -TreeHash $treeHash -ExcludedBranch $BranchName
                if ([string]::IsNullOrWhiteSpace($hint)) {
                    $issues.Add("feature branch '$BranchName' head tree is missing a passing feature gate") | Out-Null
                } else {
                    $issues.Add("feature branch '$BranchName' head tree is missing a passing feature gate for this branch; $hint") | Out-Null
                }
            }
            break
        }
        "test" {
            $validation = Get-LatestGitValidation -State $State -Branch $BranchName -Stage "final" -Status "pass" -TreeHash $treeHash
            if ($null -eq $validation) {
                $hint = Get-GitValidationHint -State $State -Stage "final" -Status "pass" -TreeHash $treeHash -ExcludedBranch $BranchName
                if ([string]::IsNullOrWhiteSpace($hint)) {
                    $issues.Add("test branch '$BranchName' head tree is missing a passing final gate") | Out-Null
                } else {
                    $issues.Add("test branch '$BranchName' head tree is missing a passing final gate for this branch; $hint") | Out-Null
                }
            }
            break
        }
        "dev" {
            $parents = Get-GitCommitParents -RootDir $RootDir -Commit $Commit
            if ($parents.Count -lt 2) {
                $issues.Add("dev branch '$BranchName' head must be an authorized merge commit from a feature branch") | Out-Null
                break
            }

            $sourceHead = $parents[1]
            $promotion = Get-LatestGitPromotion -State $State -SourceHead $sourceHead -TargetBranch $config.DevBranch -Status "authorized"
            if ($null -eq $promotion) {
                $issues.Add("dev branch '$BranchName' head is missing an authorized promotion for source head $sourceHead") | Out-Null
            }
            break
        }
        "main" {
            $parents = Get-GitCommitParents -RootDir $RootDir -Commit $Commit
            if ($parents.Count -eq 0) {
                $bootstrapValidation = Get-LatestGitValidation -State $State -Branch $BranchName -Stage "bootstrap" -Status "pass" -TreeHash $treeHash
                if ($null -eq $bootstrapValidation) {
                    $issues.Add("main branch bootstrap head is missing a passing bootstrap gate") | Out-Null
                }

                $bootstrapApproval = Get-GitApprovalRecord -State $State -SourceBranch $BranchName -SourceHead $Commit -Status "approved"
                if ($null -eq $bootstrapApproval) {
                    $issues.Add("main branch bootstrap head is missing an approved bootstrap approval") | Out-Null
                }
                break
            }

            if ($parents.Count -lt 2) {
                $legacyMainPromotions = @($State.promotions | Where-Object { $_.target_branch -eq $config.MainBranch })
                $legacyMainApprovals = @($State.approvals | Where-Object { $_.source_branch -eq $config.MainBranch })
                if ($legacyMainPromotions.Count -eq 0 -and $legacyMainApprovals.Count -eq 0 -and $BranchName -eq $config.BootstrapBranch) {
                    break
                }

                $issues.Add("main branch '$BranchName' head must be an authorized merge commit from a dedicated test branch") | Out-Null
                break
            }

            $sourceHead = $parents[1]
            $promotion = Get-LatestGitPromotion -State $State -SourceHead $sourceHead -TargetBranch $config.MainBranch -Status "authorized"
            if ($null -eq $promotion) {
                $issues.Add("main branch '$BranchName' head is missing an authorized promotion for source head $sourceHead") | Out-Null
                break
            }

            if ([string]::IsNullOrWhiteSpace($promotion.approval_id)) {
                $issues.Add("main branch '$BranchName' promotion record does not link to an approval id") | Out-Null
                break
            }

            $approval = Get-GitApprovalRecord -State $State -ApprovalId $promotion.approval_id -Status "approved"
            if ($null -eq $approval) {
                $issues.Add("main branch '$BranchName' head is missing an approved main merge approval") | Out-Null
            }
            break
        }
    }

    return @($issues)
}
