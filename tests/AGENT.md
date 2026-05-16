# AGENT.md for `tests`

## Purpose

`tests` owns regression and workflow coverage for the multi-branch compare service.

## Responsibilities

- branch-count validation coverage
- overlap fixtures
- compare-session integration coverage
- save-path and conflict-path coverage

## Boundaries

- prefer deterministic fixtures over live GitHub dependencies
- keep test failures attributable to a clear product owner when possible
