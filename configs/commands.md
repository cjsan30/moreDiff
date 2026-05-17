# Harness Commands

## Standard Commands

- build
  - `bash scripts/run_build.sh`
- unit
  - `bash scripts/run_unit.sh`
- integration
  - `bash scripts/run_integration.sh`
- benchmark smoke
  - `bash scripts/run_benchmark_smoke.sh`
- release
  - `bash scripts/run_build.sh`
- full cycle
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_harness_cycle.ps1`
- preflight
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_harness_preflight.ps1`
- retry prompt generation
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate_retry_prompt.ps1`
- retry prompt dispatch
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dispatch_retry_prompt.ps1`
- assignment claim
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/claim_assignment.ps1 -Agent <owner> -AssignmentId <assignment-id>`
- assignment complete
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/complete_assignment.ps1 -Agent <owner> -AssignmentId <assignment-id> -Result pass`

## Git Workflow Commands

- install hooks
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install_git_hooks.ps1`
- feature gate
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_git_gate.ps1 -Stage feature`
- integration gate
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_git_gate.ps1 -Stage integration`
- final gate
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_git_gate.ps1 -Stage final`
- bootstrap gate
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_git_gate.ps1 -Stage bootstrap`
- git workflow audit
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/audit_git_workflow.ps1`
- authorize feature to dev
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/authorize_branch_promotion.ps1 -SourceBranch <feature-branch> -TargetBranch dev`
- request main approval
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/request_main_merge_approval.ps1 -SourceBranch <test-branch>`
- record main approval
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/set_main_merge_approval.ps1 -ApprovalId <approval-id> -Status approved -Approver <name>`
- authorize test to main
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/authorize_branch_promotion.ps1 -SourceBranch <test-branch> -TargetBranch main -ApprovalId <approval-id>`

## Actual Handoff

- invoke assigned owner with Codex
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/invoke_assignment_codex.ps1 -Agent <owner> -AssignmentId <assignment-id>`
- invoke oldest pending assignment for an owner
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/invoke_pending_assignment_codex.ps1 -Agent <owner>`
- full retry handoff
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_retry_handoff.ps1`
- retry handoff dry run
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_retry_handoff.ps1 -DryRun`
- retry handoff preflight
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_retry_handoff.ps1 -PreflightOnly`
- explicit prompt dispatch
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dispatch_retry_prompt.ps1 -PromptId <prompt-id>`

## Notes

- `dispatch_retry_prompt.ps1` dispatches only prompts that match the latest failing cycle unless `-PromptId` is given.
- `run_harness_cycle.ps1` generates a retry prompt automatically when the cycle fails.
- use `run_harness_cycle.ps1 -SkipRetryPrompt` only for nested validation to avoid recursive retry generation.
- `invoke_assignment_codex.ps1 -DryRun` writes the prompt and readiness files without starting `codex exec`.
- `invoke_assignment_codex.ps1 -PreflightOnly` checks packet availability and local Codex CLI readiness without claiming or completing the assignment.
- live execution summaries are written to `reports/agent_runs/`.
- live dispatch events are appended to `reports/live_dispatch_log.md`.
- build/test and owner validation defaults come from `project/configs/project_profile.json`.
- new-project defaults can be generated from `init_project_adapter.ps1 -Language <language> -Framework <framework>`.
- requirements-only setup can use `init_project_adapter.ps1 -RequirementsFile <brief.md> -Interactive` to infer or ask for the target environment.
- failure classification patterns also come from `project/configs/project_profile.json`.
- cumulative suite history is written to `reports/test_results/`.
- path and harness output settings must stay inside the repository root or preflight will fail.
- Git workflow is hook-backed and stateful; see `configs/git_policy.md`.
- `pre-push` validates the actual ref updates, so `HEAD:main` or `feature:dev` style refspec bypasses are blocked.
- `pre-rebase` blocks history rewrites on protected branches.
