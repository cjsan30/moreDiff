# Assignment Seed Plan

## Meta

- plan_id: multibranch-compare-mvp
- summary: Build the MVP for a web service that compares one base branch against two to six GitHub branches in one workspace and supports in-browser edit and save.
- dispatch_mode: serial

## Assignment

- owner: agent-data
- title: github-session-foundation
- work_area: src/github
- validation: npm test -- github

### Task

Design and implement the GitHub repository access layer for the compare service. Cover repository lookup, branch listing, head SHA lookup, raw diff materialization for one base branch against multiple compare branches, and safe writeback primitives for saving file changes to a selected compare branch.

### Acceptance

- GitHub adapter can list accessible repositories and branches
- compare-session code can request diff inputs for one base branch and two to six compare branches
- branch writeback primitives validate head SHA before save
- error handling is explicit for rate limit, auth failure, and missing branch cases

### Notes

Prefer contract-first interfaces so UI and domain owners do not depend on transport details.

## Assignment

- owner: agent-domain
- title: compare-session-rules
- work_area: src/domain
- validation: npm test -- compare-session

### Task

Implement compare session creation rules and view models for a shared-base, multi-branch compare workflow. Enforce a minimum of two compare branches and a maximum of six compare branches for the initial product direction, and define save semantics for branch-local edits.

### Acceptance

- compare session rejects invalid branch counts
- duplicate compare branch selection is blocked
- grouped file-level diff summaries are produced for UI consumption
- branch-local edit requests are validated against the current session and target branch

### Notes

Represent overlap metadata directly in the view model so the UI can highlight file conflicts without recomputing them.

## Assignment

- owner: agent-ui
- title: readonly-compare-workspace
- work_area: src/ui
- validation: npm test -- workspace

### Task

Build the compare workspace that shows one base branch against multiple compare branches. Include a file tree, branch matrix, per-file diff panes, and branch-local editing flows that remain usable with two to six branches.

### Acceptance

- user can inspect changed files across all selected branches in one screen
- UI clearly shows which branches changed each file
- large file lists and branch columns remain navigable
- user can edit a selected branch file and submit a save action to that branch

### Notes

Bias toward a matrix plus focused detail pane instead of trying to render six full diffs at once.

## Assignment

- owner: agent-runtime
- title: web-session-bootstrap
- work_area: app
- validation: npm test -- app

### Task

Wire the first end-to-end compare flow: select repository, base branch, and compare branches, then open the workspace backed by the domain and data services with branch-local edit and save support.

### Acceptance

- a user can start a compare session from the web app
- invalid branch choices show clear validation errors
- workspace route loads the compare session successfully
- save actions route to the correct branch writeback path

### Notes

Keep authentication and session boot minimal for the MVP. Full editing and pull-request actions come later.

## Assignment

- owner: agent-tests
- title: mvp-regression-fixtures
- work_area: tests
- validation: npm test

### Task

Add focused regression coverage for branch-count rules, duplicate branch selection, overlapping file detection, large-diff workspace loading, and branch-local save behavior.

### Acceptance

- tests cover the two-to-six branch requirement
- at least one fixture models the same file changed across multiple branches
- workspace load and branch-local save are exercised end to end or through an integration boundary

### Notes

Use deterministic mocked GitHub payloads so the suite does not depend on live network access.
