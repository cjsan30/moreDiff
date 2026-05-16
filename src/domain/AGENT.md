# AGENT.md for `src/domain`

## Purpose

`src/domain` owns compare-session rules for the multi-branch compare service.

## Responsibilities

- base and compare branch selection rules
- minimum and maximum branch count validation
- duplicate branch detection
- overlap and save semantics

## Boundaries

- keep GitHub transport details in `src/data`
- keep persistence implementation details in `src/data`
- expose stable view models for `src/ui` and runtime owners
