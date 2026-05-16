# Harness Scripts

This directory contains the operational scripts used by the harness.

## Core Validation Commands

Preferred PowerShell entry points:

- `run_harness_preflight.ps1`
- `run_harness_cycle.ps1`
- `generate_profile_docs.ps1`
- `generate_retry_prompt.ps1`
- `dispatch_retry_prompt.ps1`
- `run_retry_handoff.ps1`
- `dispatch_seed_plan.ps1`
- `run_seed_handoff.ps1`
- `init_project_adapter.ps1`
- `claim_assignment.ps1`
- `complete_assignment.ps1`

Shell wrappers also exist for the basic validation loop, but on Windows the PowerShell scripts are the primary path.

`run_seed_handoff.ps1` refreshes the local Git hook installation before preflight so isolated worktrees use the shared repository hooks instead of branch-local copies.

`init_project_adapter.ps1` can choose default commands and owner mappings from `-Language` and `-Framework`, so most new projects only need a short project identity plus a preset.

Preset examples:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/init_project_adapter.ps1 -ProjectName my-api -Language python -Framework fastapi -Force -RunPreflight
powershell -ExecutionPolicy Bypass -File harness/scripts/init_project_adapter.ps1 -ProjectName my-web -Language typescript -Framework next -Force -RunPreflight
powershell -ExecutionPolicy Bypass -File harness/scripts/init_project_adapter.ps1 -ProjectName my-db -Language c11 -Framework none -Force -RunPreflight
powershell -ExecutionPolicy Bypass -File harness/scripts/init_project_adapter.ps1 -ProjectName my-web -Requirements "Build a Next.js dashboard with login and charts" -Force -RunPreflight
powershell -ExecutionPolicy Bypass -File harness/scripts/init_project_adapter.ps1 -ProjectName my-tool -RequirementsFile docs/product_brief.md -Interactive -Force -RunPreflight
powershell -ExecutionPolicy Bypass -File harness/scripts/init_project_adapter.ps1 -ListPresets
```

When requirements are supplied without an explicit stack, the script tries to infer a language, framework, and application type. If inference is not confident enough, rerun with `-Interactive` so it can ask for the missing environment choices.

## Baseline Workflow

Run the baseline in this order:

1. `run_harness_preflight.ps1`
2. `run_harness_cycle.ps1`
3. `generate_profile_docs.ps1`
4. `run_retry_handoff.ps1 -DryRun` when you need to verify the handoff path without starting Codex
5. `run_seed_handoff.ps1 -DryRun` when `manager-main` has already written a seed plan and you want one-session worker startup

Recommended commands:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/run_harness_preflight.ps1
powershell -ExecutionPolicy Bypass -File harness/scripts/run_harness_cycle.ps1
powershell -ExecutionPolicy Bypass -File harness/scripts/generate_profile_docs.ps1
powershell -ExecutionPolicy Bypass -File harness/scripts/run_retry_handoff.ps1 -DryRun -PromptId <prompt-id>
powershell -ExecutionPolicy Bypass -File harness/scripts/run_seed_handoff.ps1 -DryRun -PlanFile harness/reports/seed_plans/<plan-file>.md
```

Live seed handoff defaults to:

- retry a failed worker assignment up to 3 attempts
- continue to later assignments unless `-StopOnWorkerFailure` is set
- automatically advance all-passing feature branches through `dev`
- create a final `codex/test/*` candidate and request `main` approval
- stop before `main` approval/merge; that step remains manual

## Validation Artifacts

Validation writes to:

- `harness/reports/preflight_report.md`
- `harness/reports/latest_report.md`
- `harness/reports/test_results/`
- `harness/reports/logs/`

Handoff writes to:

- `harness/reports/retry_prompts/`
- `harness/reports/seed_plans/`
- `harness/reports/dispatch_packets/`
- `harness/reports/agent_runs/`
- `harness/reports/dispatch_log.md`
- `harness/reports/seed_dispatch_log.md`
- `harness/reports/assignment_log.md`
- `harness/reports/live_dispatch_log.md`

## Assignment Flow

Assignments move through three states:

1. `inbox`
2. `in_progress`
3. `done`

Use `AssignmentId` when more than one assignment exists for the same owner.

Failed harness cycles generate retry prompts automatically unless `-SkipRetryPrompt` is used.

Initial multi-owner implementation can be seeded from a `manager-main` plan file and dispatched through `run_seed_handoff.ps1`.

## Safety Expectations

- harness path settings and owner work areas must stay inside the repository root
- report and state paths must be writable during preflight
- assignment state transitions must not delete the source file before the target is safely written
- UTF-8 without BOM is the default file encoding for harness-generated files
- stale `in_progress` assignments without an active invoke lock are recovered back to `inbox`
- live worker execution expects an assignment-specific feature branch and uses an isolated worktree under `harness/state/worktrees`
- serial seed handoff still dispatches one assignment at a time, but each live run now uses its own isolated worktree instead of the shared repository root
- live seed handoff can keep going after worker failure by requeueing the failed assignment until `MaxWorkerAttempts` is reached
- automatic git advance stops at a requested main approval; it does not approve or merge `main`

## Git Workflow

Install local Git enforcement before commit, push, or merge:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/install_git_hooks.ps1
```

Required gate flow:

1. On `codex/<owner>/<task>`, seal the candidate tree and run:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage feature
```

2. Before promoting into `dev`, run the integration gate and record the promotion:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage integration
powershell -ExecutionPolicy Bypass -File harness/scripts/authorize_branch_promotion.ps1 -SourceBranch <feature-branch> -TargetBranch dev
```

3. On `codex/test/<candidate>`, run the final gate and approval flow:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/run_git_gate.ps1 -Stage final
powershell -ExecutionPolicy Bypass -File harness/scripts/request_main_merge_approval.ps1 -SourceBranch <test-branch>
powershell -ExecutionPolicy Bypass -File harness/scripts/set_main_merge_approval.ps1 -ApprovalId <approval-id> -Status approved -Approver <name>
powershell -ExecutionPolicy Bypass -File harness/scripts/authorize_branch_promotion.ps1 -SourceBranch <test-branch> -TargetBranch main -ApprovalId <approval-id>
```

Protected branches reject direct commits. The only exception is the first bootstrap commit on `main`, which requires `run_git_gate.ps1 -Stage bootstrap` and an approved bootstrap request before push.
