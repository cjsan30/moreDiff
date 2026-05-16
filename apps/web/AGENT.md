# AGENT.md for `apps/web`

## Purpose

`apps/web` owns the user-facing application shell for the multi-branch compare service.

## Responsibilities

- route structure and page flow
- GitHub sign-in entrypoints
- compare-session creation flow
- request wiring between UI and backend endpoints

## Boundaries

- do not reimplement compare-session rules that belong to `src/domain`
- do not call GitHub directly from presentation components when a shared data contract exists
- coordinate shared request and response shapes with `manager-main` when interfaces change
