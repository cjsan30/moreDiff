# AGENT.md for `app`

## Purpose

`app` owns the Next.js route layer and the top-level runtime shell for the multi-branch compare service.

## Responsibilities

- route structure
- page composition
- top-level loading and layout behavior
- wiring requests into shared services

## Boundaries

- keep compare-session policy in `src/domain`
- keep GitHub transport logic in `src/data` and `src/github`
- coordinate interface changes through `manager-main`
