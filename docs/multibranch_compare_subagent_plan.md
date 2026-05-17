# Multi-Branch Compare Subagent Plan

## Purpose

This plan maps the multi-branch compare service into harness-friendly owner slices.

The target product is a web application that compares one base branch against 2 to 6 compare branches, renders the diffs in one workspace, and allows per-branch in-browser editing with GitHub writeback.

## Read Order

Each worker should read:

1. `AGENT.md`
2. `docs/multibranch_compare_requirements.md`
3. `docs/multibranch_compare_subagent_plan.md`

## Git Rule

- live work should happen on `codex/<owner>/<task>`
- no worker edits `main`, `dev`, or `codex/test/*` directly
- promotions still follow `configs/git_policy.md`

## Owner Map

### agent-runtime

- owned area: `apps/web`, `apps/api`, bootstrap config, authentication entrypoints
- responsibilities:
  - app shell
  - routing and startup flow
  - GitHub authentication wiring
  - compare session lifecycle entrypoints
- validation:
  - app boots locally
  - auth and session routes compile

### agent-domain

- owned area: `src/domain`, `src/services/compare`, session orchestration logic
- responsibilities:
  - compare session rules
  - branch selection constraints
  - overlap detection rules
  - save and publish workflows
- validation:
  - service-layer tests for session creation, branch limits, and diff grouping

### agent-data

- owned area: `src/data`, `src/github`, persistence layer, cache layer
- responsibilities:
  - GitHub API integration
  - repository metadata fetch
  - branch fetch and diff materialization
  - session persistence and audit storage
- validation:
  - integration tests for GitHub adapters and storage contracts

### agent-ui

- owned area: `src/ui`, `components`, compare workspace, editor views
- responsibilities:
  - branch matrix and file tree
  - multi-pane diff presentation
  - editor state for per-branch changes
  - conflict and overlap indicators
- validation:
  - UI tests for workspace rendering and editor interactions

### agent-tests

- owned area: `tests`, test fixtures, mock GitHub payloads
- responsibilities:
  - end-to-end compare-session coverage
  - regression fixtures for multi-branch overlap cases
  - smoke checks for large diff rendering
- validation:
  - unit plus integration or end-to-end suite

### manager-main

- owned area: project-wide
- responsibilities:
  - decide phase cut lines
  - approve shared contracts between UI, domain, and data
  - integrate owner outputs
  - decide when compare fidelity is good enough for release

### manager-harness

- owned area: `harness`
- responsibilities:
  - keep preflight, cycle, retry, and seed handoff usable
  - route failures to the right owner
  - maintain Git gate safety during implementation

## Integration Rules

- `agent-data` defines GitHub and persistence contracts first
- `agent-domain` owns compare semantics and save rules
- `agent-ui` consumes stable view models instead of calling GitHub directly
- `agent-runtime` wires auth, routing, and session startup around those contracts
- `agent-tests` adds overlap and branch-limit fixtures around every phase

## Recommended Delivery Order

1. `agent-data`: GitHub repository and branch read path
2. `agent-domain`: compare session creation, branch-limit rules, and save semantics
3. `agent-ui`: multi-branch compare workspace with editor support
4. `agent-runtime`: auth and session boot flow
5. `agent-data` plus `agent-domain`: branch file writeback path
6. `agent-tests`: regression coverage and smoke checks
7. `manager-harness`: cycle validation and seed handoff verification

## Key Technical Risks

- GitHub API rate limits when loading multiple branches and file lists
- UI density when 6 branches change the same large file
- race conditions when saving edits to moving branch heads
- repository isolation and cleanup for temporary clones or worktrees
- diff performance for medium and large repositories
