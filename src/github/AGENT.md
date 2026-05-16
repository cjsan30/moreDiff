# AGENT.md for `src/github`

## Purpose

`src/github` holds GitHub-specific adapters for repository, branch, diff, and saveback operations.

## Responsibilities

- repository and branch queries
- compare API or clone-based diff inputs
- file content lookup for selected branches
- saveback requests with branch head validation

## Boundaries

- keep GitHub-specific transport and payload mapping here
- expose stable contracts to `src/data` and higher layers
- do not own UI or compare-session policy
