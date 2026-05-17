# AGENT.md for `harness`

## Purpose

`harness/` is the operations layer for this repository.

It is responsible for:

- build and test orchestration
- benchmark smoke execution
- failure classification
- retry prompt generation
- assignment dispatch and completion
- live or preview Codex handoff
- Git workflow gating

The harness is not product code. Its job is to keep the execution loop safe, observable, and repeatable.

## Directory Layout

```text
harness/
  AGENT.md
  assignments/
  prompts/
  scripts/
  reports/
  configs/
  state/
```

## Baseline Requirements

The harness baseline is considered complete only when all of the following are present:

1. A single source of truth in `harness/project/configs/project_profile.json`
2. A working validation pipeline for build, unit, integration, benchmark smoke, and full cycle
3. A failure model that classifies and records the next owner and task
4. Retry generation plus dispatch into assignment queues
5. A safe assignment lifecycle of `inbox -> in_progress -> done`
6. Path, write, encoding, and permission safety checks
7. Gated Git workflow rules for commit, push, merge, and promotion
8. Repository hygiene files such as `.gitignore` and `.gitattributes`
9. Operational proof through preflight, cycle, test-result records, and handoff artifacts

See `harness/configs/harness_checklist.md` for the detailed checklist.

## Main Responsibilities

- Keep the validation order fixed: build -> unit -> integration -> benchmark smoke
- Record the latest pass or fail result in `harness/reports/latest_report.md`
- Write per-suite evidence under `harness/reports/test_results/`
- Generate retry prompts for failing cycles unless explicitly skipped
- Accept a structured manager-main seed plan and convert it into assignment queues
- Convert prompts into assignments and dispatch packets
- Track live handoff results in `harness/reports/agent_runs/` and `harness/reports/live_dispatch_log.md`
- Enforce the local Git workflow described in `harness/configs/git_policy.md`

## Failure Types

- `compile`
- `interface`
- `logic`
- `missing-test`
- `environment`

## Current Guarantees

- stale locks are cleaned up by age during acquisition
- duplicate pending dispatch for the same `prompt_id` is blocked
- assignment lifecycle is `inbox -> in_progress -> done`
- assignment state files are rewritten in UTF-8
- target creation succeeds before source removal during assignment transitions
- profile-driven owner mappings, commands, and failure patterns are read from `harness/project/configs/project_profile.json`
- `run_harness_preflight.ps1` blocks harness paths and owner paths that escape the repository root
- harness report and state paths are write-tested during preflight
- cumulative suite records are written under `harness/reports/test_results/`
- failed harness cycles generate a retry prompt unless explicitly skipped
- live assignment execution uses a per-assignment feature branch target
- stale `in_progress` assignments without an active invoke lock are recovered back to `inbox`

## Primary Entry Points

Start here depending on the task:

- current harness status: `docs/current_state_summary.md`
- current validation state: `reports/preflight_report.md`, `reports/latest_report.md`, `reports/test_results/`
- project retargeting: `../docs/project_porting_template.md`, `project/configs/project_profile.json`
- script usage: `scripts/README.md`
- Git workflow safety: `configs/git_policy.md`

## Live Handoff

- `run_retry_handoff.ps1` is the single entry point from retry prompt generation to dispatch and worker invocation
- `run_seed_handoff.ps1` is the single entry point from a manager-main seed plan to serial worker invocation, retry, and automatic promotion up to a main approval request
- `invoke_assignment_codex.ps1` executes a claimed assignment through `codex exec`
- `invoke_pending_assignment_codex.ps1` selects the oldest pending assignment for an owner
- `-DryRun` writes preview artifacts without starting Codex
- `-PreflightOnly` verifies readiness and writes summary artifacts without execution
- live execution uses an isolated assignment worktree under `harness/state/worktrees` and runs on the expected assignment feature branch inside that worktree
- live seed execution retries failed assignments up to the configured limit and can continue to later assignments without operator input
- when every assignment passes, seed execution can automatically promote through `dev`, run the final gate on a `codex/test/*` branch, and request `main` approval
- seed execution must not approve or merge `main`; that remains a manual final-manager action

## Git Workflow Safety

Harness treats Git promotion as an enforced workflow, not a note in documentation.

Rules:

- feature work happens on `codex/<owner>/<task>`
- direct commits to `dev`, `main`, and `codex/test/*` are blocked by local hooks
- a feature branch must pass `run_git_gate.ps1 -Stage feature` before commit and push
- a feature branch must pass `run_git_gate.ps1 -Stage integration` before promotion into `dev`
- a dedicated `codex/test/<candidate>` branch must pass `run_git_gate.ps1 -Stage final` before main approval
- `request_main_merge_approval.ps1` and `set_main_merge_approval.ps1` record the approval step for `main`
- `authorize_branch_promotion.ps1` records the exact source-head authorization required by protected merges
- `install_git_hooks.ps1` must keep `core.hooksPath` aligned with the repository's absolute `.githooks` path so isolated worktrees use the shared hooks
- `pre-push` validates actual ref updates and rejects refspec bypasses into protected branches
- `pre-rebase` blocks rebases on protected branches
- `audit_git_workflow.ps1` should pass before trusting the current protected branch state

Use `harness/configs/git_policy.md` for the full promotion flow.
