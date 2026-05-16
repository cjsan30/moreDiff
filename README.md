# Portable Harness

This directory contains the reusable harness and subagent operations layer.

Use it by copying `harness/` into another repository root, then retargeting `harness/project/configs/project_profile.json` with `harness/scripts/init_project_adapter.ps1`.

Start with:

- `harness/docs/PORTING.md`
- `harness/docs/subagent_plan.template.md`
- `harness/docs/subagent_first_prompts.template.md`
- `harness/scripts/README.md`

The portable pieces are inside this folder, including hook templates under `harness/githooks/`. Running `harness/scripts/install_git_hooks.ps1` installs those templates into the target repository's configured hook directory.