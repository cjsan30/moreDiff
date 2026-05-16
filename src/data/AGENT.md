# AGENT.md for `src/data`

## Purpose

`src/data` owns external data access and persistence for the multi-branch compare service.

## Responsibilities

- GitHub API integration
- repository and branch loading
- diff retrieval
- branch-local saveback primitives
- persistence and cache boundaries

## Boundaries

- do not own presentation logic
- do not encode compare-session policy that belongs in `src/domain`
- keep concurrency and writeback checks explicit for callers
