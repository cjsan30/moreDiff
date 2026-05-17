# MoreDiff Requirements Completion Matrix

Date: 2026-05-17

Branch: `codex/manager-main/bootstrap-morediff`

## Status

The documented product and later-phase requirements are covered in the current
implementation. Production infrastructure can still replace the file-backed
store without changing the app-facing persistence boundary.

## Coverage

| Category | Coverage | Evidence |
| --- | --- | --- |
| Repository Access | 100% | GitHub OAuth session, PAT fallback, repository list, branch list, private repository support through authorized GitHub credentials |
| Compare Sessions | 100% | 2-6 compare branch validation, duplicate prevention, saved/reopened metadata, server persistence id used for live sessions |
| Diff Experience | 100% | Per-branch GitHub compare, file matrix grouping, added/modified/deleted/renamed status mapping, unified/split diff views, lazy file content loading, file pagination |
| Multi-Branch Workspace | 100% | Synchronized changed file list, branch presence matrix, any/all/overlap/branch filters, focused per-file branch panes |
| Editing and Saving | 100% | Branch-scoped editor, unsaved branch/file state, optimistic head validation, saveback only to selected compare branches, base branch write block |
| Review Assistance | 100% | Overlap file count, hunk overlap detection, manual reconciliation notes, exported review summary |
| AI-Generated Summaries | 100% | `OPENAI_API_KEY`-backed Responses API summary route with deterministic fallback when no key is configured |
| PR Import / Update | 100% | Open PR list refresh, same-repository PR import into base/head branch selections, PR metadata persistence, create/update PR API endpoints |
| Data Model / Persistence | 100% | User, GitHubConnection, CompareSession, SessionBranch, FileDiff, WorkspaceEdit, PullRequestImport, ReviewNote, AuditEvent records |
| Operational Harness | 100% | PowerShell gate, unit/build commands, hooks, feature branch commit/push workflow |

## Notes

- Runtime state is file-backed by default at `state/app/morediff-store.json`.
- Tokens are not persisted; saved sessions store repository, branch, diff, PR,
  note, edit, and audit metadata only.
- AI summaries use `OPENAI_API_KEY` when configured and fall back to a local
  deterministic summary so the review workflow still works without external AI
  credentials.
- A production deployment should set `MOREDIFF_STORE_FILE` or replace the store
  module with PostgreSQL/encrypted token-vault adapters behind the same boundary.
