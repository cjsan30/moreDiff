# Git Workflow Policy

## Goal

Protect commit, push, and merge operations so only a tested tree can move through the workflow.

## Protected Flow

1. Work on a feature branch named `codex/<owner>/<task>`.
   - live harness assignment branches are created from the repository baseline branch, not from whichever branch happens to be checked out
2. Stage the candidate tree and keep it sealed: no unstaged files, no untracked files, no merge conflicts.
3. Run the owner gate:
   - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage feature`
4. Commit and push the feature branch.
5. Run the manager integration gate on the same feature branch:
   - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage integration`
6. Authorize promotion into `dev`:
   - `powershell -ExecutionPolicy Bypass -File harness/scripts/authorize_branch_promotion.ps1 -SourceBranch <feature-branch> -TargetBranch dev`
7. Merge into `dev`. The protected merge hook allows the merge only when the authorization exists for the exact source head.
8. Create a dedicated final test branch named `codex/test/<candidate>` from `dev`.
9. Run the final full-cycle gate:
   - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage final`
10. Request main merge approval:
    - `powershell -ExecutionPolicy Bypass -File harness/scripts/request_main_merge_approval.ps1 -SourceBranch <test-branch>`
11. Record the approval or rejection:
    - `powershell -ExecutionPolicy Bypass -File harness/scripts/set_main_merge_approval.ps1 -ApprovalId <id> -Status approved -Approver <name>`
12. Authorize promotion into `main`:
    - `powershell -ExecutionPolicy Bypass -File harness/scripts/authorize_branch_promotion.ps1 -SourceBranch <test-branch> -TargetBranch main -ApprovalId <id>`
13. Merge into `main`. The protected merge and push hooks enforce the authorization and approval.

## Bootstrap Rule

The first protected commit on `main` is special because this repository currently has no `HEAD`.

Bootstrap flow:

1. Stage the initial baseline.
2. Run:
   - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage bootstrap`
3. Commit on `main`.
4. Request approval:
   - `powershell -ExecutionPolicy Bypass -File harness/scripts/request_main_merge_approval.ps1 -Bootstrap`
5. Record approval:
   - `powershell -ExecutionPolicy Bypass -File harness/scripts/set_main_merge_approval.ps1 -ApprovalId <id> -Status approved -Approver <name>`
6. Push `main`.

## Hard Rules

- Do not commit directly on `dev`.
- Do not commit directly on `main`.
- Do not commit directly on `codex/test/*`.
- Do not push a feature branch unless the current `HEAD` tree matches a passing `feature` gate.
- Do not push a test branch unless the current `HEAD` tree matches a passing `final` gate.
- Do not merge into `dev` unless `feature` and `integration` gates passed for the exact source head.
- Do not merge into `main` unless `final` passed, approval is `approved`, and the source head was explicitly authorized.
- Do not use destructive Git commands from harness automation.
- Do not revert unrelated user changes.

## Enforcement

- `.githooks/pre-commit` blocks commits that do not satisfy the branch rules.
- `.githooks/pre-push` blocks pushes that do not satisfy the gate and promotion rules.
- `.githooks/pre-merge-commit` blocks protected merges without promotion authorization.
- `.githooks/pre-rebase` blocks rebases on protected branches.
- `harness/scripts/install_git_hooks.ps1` installs `core.hooksPath` as the repository's absolute `.githooks` path so isolated worktrees always use the shared hooks.
- `harness/scripts/run_harness_preflight.ps1` fails when the hook path, Git workflow files, or current protected branch state are invalid.
- `harness/scripts/audit_git_workflow.ps1` audits the current branch head against the recorded gate, promotion, and approval state.

## Limits

This policy is strong locally, but not perfect:

- `git commit --no-verify` or `git push --no-verify` can bypass local hooks.
- There is no server-side branch protection in this repository yet.
- Approval is recorded locally, not in a remote review system.

## Remaining Manual Controls

- do not use custom refspec pushes to target protected branches outside the documented promotion flow
- do not rewrite protected branch history with low-level Git commands
- if a hook was bypassed, run `audit_git_workflow.ps1` and fix the branch before the next merge or push
