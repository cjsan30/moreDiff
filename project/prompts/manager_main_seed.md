# Manager Main Seed Plan Format

Use this when `manager-main` is the only live Codex session and needs to seed subagent work without opening separate interactive sessions.

Write a Markdown file under `harness/reports/seed_plans/` using this exact structure.

## Required Shape

```md
# Assignment Seed Plan

## Meta

- plan_id: <short-unique-id>
- summary: <one-line summary>
- dispatch_mode: serial

## Assignment

- owner: agent-runtime
- title: <short task title>
- work_area: <optional override; default comes from profile>
- validation: <optional override; default comes from profile>

### Task

<plain-language task for the subagent>

### Acceptance

- <acceptance item 1>
- <acceptance item 2>

### Notes

<optional notes; write `none` when there is nothing extra>

## Assignment

- owner: agent-query
- title: <next task title>
...
```

## Rules

- one `## Assignment` block per owner task
- keep `owner` aligned with `harness/project/configs/project_profile.json`
- keep `title` short and stable; it becomes part of the assignment id
- keep `dispatch_mode: serial`; the harness currently starts one worker at a time, but each live run uses its own isolated worktree
- `Task` must be concrete enough for a worker to execute without another interactive handoff
- `Acceptance` should state the observable pass condition, not implementation detail

## Recommended Follow-up Command

After the plan file is written, run:

```powershell
powershell -ExecutionPolicy Bypass -File harness/scripts/run_seed_handoff.ps1 -PlanFile <plan-file>
```

Use `-DryRun` first when validating the plan shape.

Live behavior:

- retries failed worker assignments up to 3 attempts by default
- continues to the next assignment unless `-StopOnWorkerFailure` is set
- automatically promotes all-passing work through `dev`
- prepares a final `codex/test/*` branch and requests `main` approval
- does not approve or merge `main`
