# AGENT.md for `src/ui`

## Purpose

`src/ui` owns the compare workspace, diff presentation, and editing interactions.

## Responsibilities

- branch matrix and file tree
- focused diff views
- editor state and unsaved state indicators
- save and conflict messaging

## Boundaries

- do not fetch GitHub data directly when shared services exist
- keep branch comparison readable for two to six compare branches
- coordinate cross-owner interface changes through `manager-main`
