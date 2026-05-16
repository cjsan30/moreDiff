param(
    [Parameter(Mandatory = $true)]
    [string]$ApprovalId,
    [Parameter(Mandatory = $true)]
    [ValidateSet("approved", "rejected")]
    [string]$Status,
    [Parameter(Mandatory = $true)]
    [string]$Approver,
    [string]$Notes = "",
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

$state = Get-GitWorkflowState -RootDir $rootDir
$approvalRecord = Get-GitApprovalRecord -State $state -ApprovalId $ApprovalId
if ($null -eq $approvalRecord) {
    throw "approval record not found: $ApprovalId"
}

$approvalRecord.status = $Status
$approvalRecord.approver = $Approver
$approvalRecord.decided_at = (Get-Date).ToString("o")
$approvalRecord.notes = $(if ([string]::IsNullOrWhiteSpace($Notes)) { "none" } else { $Notes })

$reportContent = @"
# Main Merge Approval Decision

## Summary

- approval_id: $ApprovalId
- status: $Status
- approver: $Approver
- source_branch: $($approvalRecord.source_branch)
- source_head: $($approvalRecord.source_head)
- decided_at: $($approvalRecord.decided_at)

## Notes

$(if ([string]::IsNullOrWhiteSpace($Notes)) { "No notes were provided." } else { $Notes })
"@

$reportPath = Write-GitWorkflowReport -RootDir $rootDir -Prefix ("approval_decision_" + ($ApprovalId -replace "[^A-Za-z0-9_-]", "_")) -Content $reportContent
$approvalRecord.report = Get-RelativeProjectPath -RootDir $rootDir -AbsolutePath $reportPath

Save-GitWorkflowState -RootDir $rootDir -State $state | Out-Null

Write-Output "approval_id: $ApprovalId"
Write-Output "status: $Status"
Write-Output "report: $reportPath"
