# Current State Summary

## Status

- date: 2026-05-18
- branch: `codex/manager-main/bootstrap-morediff`
- harness mode: standalone checkout
- PowerShell entrypoint: `powershell.exe`
- operational status: pass

## Latest Verified Commands

- `npx tsc --noEmit`
- `npm test`
- `npm run test:integration`
- `npm run test:smoke`
- `npm run build`
- `git diff --check`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_harness_preflight.ps1`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_harness_cycle.ps1 -SkipRetryPrompt`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_seed_handoff.ps1 -DryRun -PlanFile reports/seed_plans/multibranch_compare_mvp_seed.md`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_git_gate.ps1 -Stage feature`

## Evidence

- latest full cycle: `reports/latest_report.md`
- preflight report: `reports/preflight_report.md`
- test records: `reports/test_results/`
- seed dispatch summary: `reports/seed_plans/multibranch-compare-mvp__dispatch_summary.md`
- dry-run handoff records: `reports/agent_runs/`
- git workflow records: `reports/git_workflow/`

## Notes

- Windows PowerShell 5.1 is used through `powershell.exe` from WSL.
- Product commands can be run directly with `npm` from WSL/bash or Windows PowerShell.
- Harness cycle commands still use PowerShell entrypoints, and the shell wrappers keep WSL/NVM Node available for automated harness validation.
- Generated runtime artifacts are ignored unless intentionally tracked as operating logs.
