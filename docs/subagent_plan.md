# Subagent Plan

## Purpose

This project builds a web application for multi-branch GitHub comparison and branch-local editing.

The product compares one base branch against 2 to 6 compare branches, shows the diffs in a single workspace, and allows in-browser edits that save back to the selected compare branch.

## Read Order

Each worker should read:

1. `AGENT.md`
2. `docs/requirements.md`
3. `docs/subagent_plan.md`
4. `docs/subagent_first_prompts.md`
5. `harness/AGENT.md`
6. the owned folder `AGENT.md`, when present

## Git Rule

- live work must happen on `codex/<owner>/<task>`
- workers do not work directly on `main`, `dev`, or `codex/test/*`
- commits, pushes, and promotions follow `harness/configs/git_policy.md`

## Owner Map

### agent-runtime

- owned area: `app`, configuration, auth entrypoints, app bootstrap
- responsibilities:
  - application startup
  - routing and session flow
  - GitHub authentication wiring
  - request boundaries between UI and backend services
- validation: `npm test -- app`

### agent-domain

- owned area: `src/domain`, `src/services/compare`
- responsibilities:
  - compare session rules
  - branch count and duplicate branch validation
  - overlap detection rules
  - save semantics for branch-local edits
- validation: `npm test -- compare-session`

### agent-data

- owned area: `src/data`, `src/github`, persistence, caching
- responsibilities:
  - GitHub API integration
  - branch and repository loading
  - diff materialization
  - branch writeback and save concurrency checks
  - session persistence and audit data
- validation: `npm test -- github`

### agent-ui

- owned area: `src/ui`, `components`, compare workspace, editor views
- responsibilities:
  - branch matrix and file tree
  - diff presentation
  - branch-local editor state
  - save UX, unsaved state, and conflict indicators
- validation: `npm test -- workspace`

### agent-tests

- owned area: `tests`, fixtures, mock GitHub payloads
- responsibilities:
  - regression coverage
  - overlap fixtures
  - end-to-end or integration checks for compare sessions and saves
- validation: `npm test`

### manager-main

- owned area: project-wide
- responsibilities:
  - prioritize phases
  - approve shared contracts
  - reconcile owner outputs
  - decide release readiness

### manager-harness

- owned area: `harness`
- responsibilities:
  - keep preflight, cycle, retry, and dispatch operational
  - classify failures and route work correctly
  - preserve Git workflow safety during implementation

## Integration Rules

- `agent-data` defines repository, branch, diff, and writeback contracts first
- `agent-domain` owns compare semantics and session rules
- `agent-ui` consumes stable view models and does not call GitHub directly
- `agent-runtime` wires auth, routing, and request flow around shared contracts
- `agent-tests` adds regression coverage around branch limits, overlap, and save behavior
- `manager-harness` changes harness mechanics, not product behavior

## Delivery Order

1. GitHub access and compare-session contracts
2. compare-session domain rules and save semantics
3. multi-branch workspace and editor UI
4. runtime integration for auth, repository selection, and session creation
5. writeback path and save conflict handling
6. regression and smoke coverage
7. harness cycle and seed-handoff verification
