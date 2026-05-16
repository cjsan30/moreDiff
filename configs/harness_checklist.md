# Harness Checklist

## 1. Single Source Of Truth

- `harness/project/configs/project_profile.json` exists
- project identity, commands, owners, dispatch, failure patterns, Git workflow, and harness paths are defined in the profile
- generated profile documentation can be refreshed from the profile

## 2. Validation Pipeline

- build passes
- unit tests exist and run
- integration tests exist and run
- benchmark smoke exists and runs
- full-cycle execution is available through `run_harness_cycle.ps1`

## 3. Failure Model

- failures are classified and recorded
- permission errors such as `Access is denied` are classified as `environment`
- latest report captures status, failing module, next owner, and next task
- suite logs are written under `harness/reports/logs/`

## 4. Retry And Dispatch

- failed cycles generate a retry prompt under `harness/reports/retry_prompts/`
- retry work is assigned to a concrete owner
- dispatch log is updated
- manager-harness can inspect the retry prompt and decide the next owner

## 5. Assignment Lifecycle

- assignment inbox files are created
- claim moves an assignment into `in_progress`
- complete moves an assignment into `done`
- assignment log is updated
- dry-run or live handoff artifacts are written for worker invocation
- stale `in_progress` work can be recovered safely

## 6. Safety Controls

- owner paths and harness paths cannot escape the repository root
- report and state paths are write-tested during preflight
- assignment state movement does not delete the source before the target is safely written
- harness-generated files are written in UTF-8

## 7. Git Governance

- `.gitignore` exists for generated artifacts used by validation and harness runs
- `.gitattributes` exists for line-ending and binary handling
- `core.hooksPath` points to the repository's absolute `.githooks` path
- `.githooks/pre-commit`, `.githooks/pre-push`, `.githooks/pre-merge-commit`, and `.githooks/pre-rebase` exist
- feature branches use the `codex/<owner>/<task>` shape
- final test branches use the `codex/test/<candidate>` shape
- live subagent runs use assignment-specific feature branches
- commit is blocked unless the exact tree passed the correct gate
- push is blocked unless the current `HEAD` tree passed the correct gate
- direct refspec pushes into protected branches are blocked
- protected branch rebases are blocked
- merge into `dev` is blocked unless feature and integration gates passed and promotion was authorized
- merge into `main` is blocked unless final gate passed, approval exists, and promotion was authorized

## 8. Repository Hygiene

- generated harness artifacts stay ignored by Git
- documentation entry points are readable and not mojibake-corrupted
- line endings are controlled by repository attributes instead of per-machine defaults

## 9. Operational Proof

- `run_harness_preflight.ps1` passes
- `run_harness_cycle.ps1` passes
- per-suite records exist under `harness/reports/test_results/`
- a current dry-run or preflight-only handoff record exists under `harness/reports/agent_runs/`
- current state documentation matches the actual harness status
