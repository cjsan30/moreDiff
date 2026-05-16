# Requirements

## Product Goal

Build a web service that extends the GitHub compare workflow from one compare branch to many compare branches at once.

The target experience is similar to:

`https://github.com/<owner>/<repo>/compare/<base>...<compare>`

but supports reviewing, editing, and reconciling changes from 2 to 6 branches in one workspace.

## Problem

GitHub compare and pull request workflows are optimized for one base and one compare branch at a time. Teams that develop related work in parallel need a faster way to inspect multiple branches together, identify overlap, and reconcile changes without manually jumping between separate compare pages.

## Core Value

Users should be able to compare one base branch against 2 to 6 compare branches in a single session, understand which files changed in which branches, edit branch content directly in the browser, and save those changes back to the correct branch safely.

## Primary Users

- team leads
- reviewers
- developers working on parallel branches

## Main Usage Scenario

Several people modify the same feature or nearby features at the same time. A reviewer or lead needs to compare those branches quickly, spot overlap or conflict risk, and optionally fix branch content before merge or pull request cleanup.

## Core User Flow

1. sign in with GitHub
2. select a repository
3. choose one base branch
4. choose 2 to 6 compare branches
5. open a compare session
6. inspect file-level and branch-level diff summaries
7. open a file and compare branch changes
8. edit a selected branch file in the browser when needed
9. save the change back to the selected branch

## Functional Requirements

### Repository Access

- support GitHub OAuth or GitHub App authentication
- list accessible repositories
- list branches for the selected repository
- support private repositories when access is authorized

### Compare Sessions

- create a compare session with one repository, one base branch, and 2 to 6 compare branches
- persist session metadata so a session can be reopened
- prevent duplicate compare branches inside the same session

### Diff Experience

- compute per-branch diff against the same base branch
- group diff results by file path
- show added, removed, renamed, and modified files
- show unified and split diff views where practical
- keep large diffs usable with lazy loading, pagination, or virtualization

### Multi-Branch Workspace

- show a synchronized file tree across selected branches
- show which branches changed each file
- support quick filtering by change presence
- support inspecting one file across multiple branches in a focused workspace

### Editing and Saving

- open a file from any compare branch in an editor
- track unsaved state per file and per branch
- validate branch head state before save
- save changes only to the selected compare branch
- never write directly to the base branch

### Review Assistance

- indicate when multiple compare branches changed the same file
- indicate overlapping hunk regions where feasible
- support exporting or summarizing overlap information in later phases

## Data Model

### User

- id
- email
- name

### GitHubConnection

- id
- user_id
- github_account_id
- access_token_ref

### CompareSession

- id
- user_id
- repo_owner
- repo_name
- base_branch
- created_at
- updated_at

### SessionBranch

- id
- session_id
- branch_name
- ordinal
- head_sha

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
- original_sha
- edited_content
- saved_at

## Constraints and Risks

- GitHub API rate limits may affect branch and diff loading
- large diffs across six branches may degrade UI performance
- overlapping edits in the same file are difficult to visualize clearly
- saves must handle optimistic concurrency when a branch head changes
- private repository access and token handling must be strict

## MVP Scope

- GitHub login
- repository selection
- base branch plus 2 to 6 compare branch selection
- multi-branch diff workspace
- file-level branch change matrix
- browser editing for a selected compare branch
- save changes back to the selected compare branch
- session save and reopen

## Later Phases

- import multiple pull requests as branch selections
- highlight overlap and conflict regions more deeply
- review notes and approval flow
- pull request creation or update
- AI-generated change summaries

## Success Criteria

- a user can compare 2 to 6 branches against one base branch in a single workspace
- users can quickly identify which files changed in which branches
- the workspace remains usable on medium and large repositories
- a user can edit and safely save a file back to the intended compare branch
