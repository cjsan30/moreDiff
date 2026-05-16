# Project Adapter

This directory contains the project-specific adapter layer for the reusable harness core.

## Purpose

The reusable engine lives in:

- `harness/scripts/`
- `.githooks/`
- `harness/configs/project_profile.template.json`
- `harness/configs/git_policy.md`
- `harness/configs/retry_dispatch_policy.md`

The files under `harness/project/` are the pieces that must be retargeted when the harness is applied to a different repository.

## Canonical Project Adapter Files

- `configs/project_profile.json`
- `prompts/manager_main.md`
- `prompts/manager_main_seed.md`
- `prompts/manager_harness.md`

## Retargeting Rule

When porting the harness:

1. keep the harness core as-is first
2. copy `harness/configs/project_profile.template.json`
3. save the project-specific profile as `harness/project/configs/project_profile.json`
4. rewrite the prompt files in `harness/project/prompts/`
5. update repository-specific docs such as:
   - `AGENT.md`
   - `docs/requirements.md`
   - `docs/subagent_plan.md`
   - `docs/subagent_first_prompts.md`

## Compatibility

Legacy prompt references may still appear in old reports or historical assignment packets, but they are not part of the active harness layout.

The active project prompt files are:

- `harness/project/prompts/manager_main.md`
- `harness/project/prompts/manager_main_seed.md`
- `harness/project/prompts/manager_harness.md`

The active project profile is `harness/project/configs/project_profile.json`. The reusable core keeps only `harness/configs/project_profile.template.json`.
