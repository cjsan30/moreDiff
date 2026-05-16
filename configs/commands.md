# Harness Commands

## Standard Commands

- build
  - `make`
- unit
  - `make unit`
- integration
  - `make integration`
- benchmark smoke
  - `make benchmark-smoke`
- release
  - `make`
- full cycle
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_harness_cycle.ps1`
- preflight
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_harness_preflight.ps1`
- retry prompt generation
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/generate_retry_prompt.ps1`
- retry prompt dispatch
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/dispatch_retry_prompt.ps1`
- assignment claim
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/claim_assignment.ps1 -Agent <owner> -AssignmentId <assignment-id>`
- assignment complete
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/complete_assignment.ps1 -Agent <owner> -AssignmentId <assignment-id> -Result pass`

## Git Workflow Commands

- install hooks
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/install_git_hooks.ps1`
- feature gate
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage feature`
- integration gate
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage integration`
- final gate
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage final`
- bootstrap gate
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage bootstrap`
- git workflow audit
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/audit_git_workflow.ps1`
- authorize feature to dev
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/authorize_branch_promotion.ps1 -SourceBranch <feature-branch> -TargetBranch dev`
- request main approval
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/request_main_merge_approval.ps1 -SourceBranch <test-branch>`
- record main approval
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/set_main_merge_approval.ps1 -ApprovalId <approval-id> -Status approved -Approver <name>`
- authorize test to main
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/authorize_branch_promotion.ps1 -SourceBranch <test-branch> -TargetBranch main -ApprovalId <approval-id>`

## Actual Handoff

- invoke assigned owner with Codex
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/invoke_assignment_codex.ps1 -Agent <owner> -AssignmentId <assignment-id>`
- invoke oldest pending assignment for an owner
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/invoke_pending_assignment_codex.ps1 -Agent <owner>`
- full retry handoff
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_retry_handoff.ps1`
- retry handoff dry run
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_retry_handoff.ps1 -DryRun`
- retry handoff preflight
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/run_retry_handoff.ps1 -PreflightOnly`
- explicit prompt dispatch
  - `powershell -ExecutionPolicy Bypass -File harness/scripts/dispatch_retry_prompt.ps1 -PromptId <prompt-id>`

## Notes

- `dispatch_retry_prompt.ps1` dispatches only prompts that match the latest failing cycle unless `-PromptId` is given.
- `run_harness_cycle.ps1` generates a retry prompt automatically when the cycle fails.
- use `run_harness_cycle.ps1 -SkipRetryPrompt` only for nested validation to avoid recursive retry generation.
- `invoke_assignment_codex.ps1 -DryRun` writes the prompt and readiness files without starting `codex exec`.
- `invoke_assignment_codex.ps1 -PreflightOnly` checks packet availability and local Codex CLI readiness without claiming or completing the assignment.
- live execution summaries are written to `harness/reports/agent_runs/`.
- live dispatch events are appended to `harness/reports/live_dispatch_log.md`.
- build/test and owner validation defaults come from `harness/project/configs/project_profile.json`.
- new-project defaults can be generated from `init_project_adapter.ps1 -Language <language> -Framework <framework>`.
- requirements-only setup can use `init_project_adapter.ps1 -RequirementsFile <brief.md> -Interactive` to infer or ask for the target environment.
- failure classification patterns also come from `harness/project/configs/project_profile.json`.
- cumulative suite history is written to `harness/reports/test_results/`.
- path and harness output settings must stay inside the repository root or preflight will fail.
- Git workflow is hook-backed and stateful; see `harness/configs/git_policy.md`.
- `pre-push` validates the actual ref updates, so `HEAD:main` or `feature:dev` style refspec bypasses are blocked.
- `pre-rebase` blocks history rewrites on protected branches.
