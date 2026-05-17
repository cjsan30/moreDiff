# Project Profile Summary

Generated from:

- project/configs/project_profile.json

## Project

- name: morediff
- language: TypeScript
- runtime: Node.js web application
- framework: Next.js
- ide: VS Code

## Summary

Web service for comparing one GitHub base branch against 2 to 6 compare branches in one workspace with branch-local editing and saveback.

## Source Docs

- AGENT.md
- docs/requirements.md
- docs/subagent_plan.md
- docs/subagent_first_prompts.md

## Success Criteria

- support one base branch plus two to six compare branches in a single session
- support branch-local editing and safe saveback as part of the MVP
- keep harness validation and assignment flow operational

## Commands

- build: bash scripts/run_build.sh
- unit: bash scripts/run_unit.sh
- integration: bash scripts/run_integration.sh
- benchmark_smoke: bash scripts/run_benchmark_smoke.sh
- release: bash scripts/run_build.sh
- full_cycle: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_harness_cycle.ps1

## Owners

### agent-runtime

- work_area: app
- validation: bash scripts/run_npm_test.sh -- app

Read first:

- AGENT.md
- docs/requirements.md
- docs/subagent_plan.md
- docs/subagent_first_prompts.md
- app/AGENT.md

Failure scope:

- startup flow
- routing
- auth entrypoints
- session bootstrap
### agent-domain

- work_area: src/domain
- validation: bash scripts/run_npm_test.sh -- compare-session

Read first:

- AGENT.md
- docs/requirements.md
- docs/subagent_plan.md
- docs/subagent_first_prompts.md
- src/domain/AGENT.md

Failure scope:

- session rules
- branch constraints
- overlap semantics
- save semantics
### agent-data

- work_area: src/data
- validation: bash scripts/run_npm_test.sh -- github

Read first:

- AGENT.md
- docs/requirements.md
- docs/subagent_plan.md
- docs/subagent_first_prompts.md
- src/data/AGENT.md

Failure scope:

- GitHub integration
- diff materialization
- persistence
- branch writeback
### agent-ui

- work_area: src/ui
- validation: bash scripts/run_npm_test.sh -- workspace

Read first:

- AGENT.md
- docs/requirements.md
- docs/subagent_plan.md
- docs/subagent_first_prompts.md
- src/ui/AGENT.md

Failure scope:

- workspace layout
- diff rendering
- editor state
- save interactions
### agent-tests

- work_area: tests
- validation: bash scripts/run_npm_test.sh

Read first:

- AGENT.md
- docs/requirements.md
- docs/subagent_plan.md
- docs/subagent_first_prompts.md
- tests/AGENT.md

Failure scope:

- regression coverage
- fixtures
- integration tests
- smoke checks
### manager-main

- work_area: project-wide
- validation: bash scripts/run_npm_test.sh

Read first:

- AGENT.md
- docs/requirements.md
- docs/subagent_plan.md
- docs/subagent_first_prompts.md
- project/prompts/manager_main.md
- project/prompts/manager_main_seed.md
- configs/git_policy.md

Failure scope:

- cross-module
- interface reconciliation
- integration ownership
### manager-harness

- work_area: scripts
- validation: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_harness_cycle.ps1 -SkipRetryPrompt

Read first:

- AGENT.md
- docs/requirements.md
- docs/subagent_plan.md
- docs/subagent_first_prompts.md
- project/prompts/manager_harness.md
- configs/git_policy.md
- configs/retry_dispatch_policy.md

Failure scope:

- tooling
- dispatch
- automation

## Dispatch

- compile_owner: manager-main
- interface_owner: manager-main
- environment_owner: manager-harness
- default_failure_type: logic
- repeat_failure_escalation_owner: manager-main

## Failure Patterns

### environment

- command not found
- not recognized
- No such file
- No such file or directory
- cannot find the path specified
- Cannot find module
- ERR_MODULE_NOT_FOUND
- ModuleNotFoundError
- ImportError
- package not found
- No module named
- Access is denied
- Permission denied
- UnauthorizedAccessException
- EPERM
- EACCES
- ECONNREFUSED
- ETIMEDOUT
- ENOTFOUND
- network timeout
- Temporary failure in name resolution

### compile

- error:
- fatal error
- compilation failed
- SyntaxError
- TypeScript error
- TS2307
- TS2322
- build failed
- Failed to compile
- Prisma schema validation

### interface

- mismatch
- incompatible
- conflict
- expected
- actual
- AssertionError
- TypeError
- ReferenceError
- undefined method
- AttributeError
- contract
- schema validation
## Git Workflow

- hooks_path: .githooks
- state_file: state/git_workflow/state.json
- reports_dir: reports/git_workflow
- bootstrap_branch: codex/manager-main/bootstrap-morediff
- main_branch: main
- dev_branch: dev
- feature_branch_prefix: codex/
- test_branch_prefix: codex/test/

## Harness Paths

- logs: reports/logs
- latest_report: reports/latest_report.md
- preflight_report: reports/preflight_report.md
- test_results: reports/test_results
- retry_prompts: reports/retry_prompts
- seed_plans: reports/seed_plans
- dispatch_packets: reports/dispatch_packets
- agent_runs: reports/agent_runs
- assignments_root: assignments
- assignment_worktrees_root: state/worktrees
- dispatch_log: reports/dispatch_log.md
- seed_dispatch_log: reports/seed_dispatch_log.md
- assignment_log: reports/assignment_log.md
- live_dispatch_log: reports/live_dispatch_log.md
- assignment_stale_seconds: 7200