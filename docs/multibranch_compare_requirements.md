# Multi-Branch Compare Service

## Product Goal

Build a web service that extends the GitHub compare workflow from one compare branch to many compare branches at once.

The target experience is similar to:

`https://github.com/<owner>/<repo>/compare/<base>...<compare>`

but supports reviewing, editing, and reconciling changes from 2 to 6 branches in one workspace.

## Primary User Story

A user connects a GitHub repository, selects one base branch, then selects 2 to 6 compare branches.

The service should:

- fetch the selected branches from GitHub
- compute diffs from the same base branch to each compare branch
- show the diffs side by side in one web interface
- let the user inspect file-level and hunk-level changes per branch
- let the user edit branch content directly in the browser
- let the user save changes back to the corresponding branch

## Core Functional Requirements

### Repository Access

- support GitHub OAuth or GitHub App authentication
- list repositories the user can access
- list branches for the selected repository
- support private repositories when GitHub permissions allow it

### Compare Session

- create a compare session with:
  - one repository
  - one base branch
  - 2 to 6 compare branches
- persist compare session metadata so the user can reopen a session
- prevent duplicate branch selection inside the same session

### Diff Engine

- calculate per-branch diff against the same base branch
- group results by file path
- show added, removed, renamed, and modified files
- show unified diff and split diff views
- support large diffs with lazy loading or pagination

### Multi-Branch Review UI

- show a synchronized file tree across all selected branches
- highlight which branches changed each file
- support file filters:
  - changed in all branches
  - changed in any branch
  - changed only in selected branches
- support side-by-side comparison across multiple branches for the same file
- support branch presence matrix for quick visual scanning

### Editing

- open a file from any compare branch in an editor
- edit the branch file in browser
- show unsaved state per branch and file
- validate optimistic concurrency before save
- allow saving only to the branch being edited
- do not write directly to the base branch

### Merge Assistance

- show when two or more compare branches touch the same file
- show overlapping hunk regions across branches
- support manual reconciliation notes
- support exporting a summary of overlapping changes

### GitHub Writeback

- commit edits back to the selected compare branch
- let the user choose commit message per save or per batch
- optionally create or update pull requests after edits

## Non-Functional Requirements

- target repositories with medium-sized pull-request scale diffs
- keep branch fetch and diff generation responsive through caching
- isolate repository working state per session
- record audit events for load, edit, save, and publish actions
- handle GitHub API rate limits predictably

## Constraints

- one compare session supports 2 to 6 compare branches
- the base branch is read-only in the compare session
- editing writes only to explicit compare branches chosen by the user
- branch fetches and diff generation must not corrupt each other across sessions

## Recommended Technical Shape

### Frontend

- Next.js web app
- Monaco editor for file editing
- a virtualized diff UI for large files

### Backend

- Next.js route handlers or a separate API service
- GitHub REST and GraphQL APIs for repository metadata and pull request actions
- local temporary clones or isolated worktrees for accurate diff and writeback

### Storage

- PostgreSQL for sessions, branch selections, audit events, and saved workspace state
- Redis or in-memory cache for branch metadata and rendered diff fragments

## Suggested Domain Model

### CompareSession

- id
- github_user_id
- repo_owner
- repo_name
- base_branch
- status
- created_at
- updated_at

### SessionBranch

- id
- session_id
- branch_name
- ordinal
- latest_head_sha

### FileDiff

- id
- session_id
- branch_name
- file_path
- status
- additions
- deletions
- patch

### WorkspaceEdit

- id
- session_id
- branch_name
- file_path
- base_sha
- head_sha
- draft_content
- saved_at

## Delivery Phases

### Phase 1: Read-Only Compare MVP

- connect GitHub
- select repo, base branch, and 2 to 6 compare branches
- compute diffs
- render multi-branch diff matrix in the browser

### Phase 2: Editing and Review Workflow

- open and edit files from each compare branch
- save back to GitHub branches
- show save conflicts and retry flow

- overlap detection
- notes and review summary
- pull request creation or update

## Acceptance Criteria

- a user can compare one base branch with 2 to 6 compare branches in one session
- the UI can scale up to 6 compare branches without collapsing into an unreadable layout
- a user can edit a file on a selected compare branch and save that change back to GitHub
- overlapping file changes across branches are visibly identifiable
- session state can be reopened without rebuilding the entire workflow from scratch
