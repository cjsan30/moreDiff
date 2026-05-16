# Harness Porting Guide

## What Porting Means

Porting means copying this `harness/` directory into another repository root and retargeting its project adapter so the same validation, assignment, subagent handoff, retry, report, and Git gate workflow works for that repository.

The expected layout after copying is:

```text
<target-repo>/
  harness/
    scripts/
    configs/
    project/
    docs/
    githooks/
```

Do not run the scripts with `harness/` itself as the repository root unless you intentionally set `CODEX_HARNESS_ROOT` and rewrite all profile paths. The scripts assume `harness/scripts` is under the target repository root.

## Minimal Porting Flow

1. Copy `harness/` into the target repository root.
2. From the target root, initialize the adapter:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/init_project_adapter.ps1 -ProjectName <name> -Language <language> -Framework <framework> -Force
```

3. Review `harness/project/configs/project_profile.json`.
4. Create or update the target repository's root docs from the templates in `harness/docs/`:
   - `AGENT.md`
   - `docs/requirements.md`
   - `docs/subagent_plan.md`
   - `docs/subagent_first_prompts.md`
5. Install hooks and run validation:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/install_git_hooks.ps1
powershell -ExecutionPolicy Bypass -File harness/scripts/run_harness_preflight.ps1
powershell -ExecutionPolicy Bypass -File harness/scripts/run_harness_cycle.ps1 -SkipRetryPrompt
```

## Git Hooks

`harness/githooks/` is the portable hook template set. `install_git_hooks.ps1` installs these files into the target root's configured hook directory, normally `.githooks`, and then sets local `core.hooksPath`.

Required hook templates:

- `harness/githooks/pre-commit`
- `harness/githooks/pre-push`
- `harness/githooks/pre-merge-commit`
- `harness/githooks/pre-rebase`

## Adapter Files

Project-specific files live under `harness/project/`:

- `harness/project/configs/project_profile.json`
- `harness/project/prompts/manager_main.md`
- `harness/project/prompts/manager_main_seed.md`
- `harness/project/prompts/manager_harness.md`

These are intentionally rewritten per target repository. The reusable engine is in `harness/scripts`, `harness/configs`, `harness/githooks`, and these docs.

## Verification Levels

- Preflight only: hook paths, profile shape, owner paths, writable report paths, and command availability are valid.
- Full cycle: build, unit, integration, benchmark smoke, and report writing all pass.
- Dry-run handoff: assignment dispatch and Codex prompt packaging are valid without launching a worker.
- Live handoff: a real worker assignment runs in an isolated worktree and records a pass/fail summary.

A repository is not fully ported until at least preflight and one full cycle pass in the target repository.