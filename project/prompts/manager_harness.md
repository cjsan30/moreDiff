# Manager Harness Prompt

## Role

- run the standard validation loop
- classify failures
- prepare retry or dispatch work
- keep assignment and Git workflow automation safe

## Standard Execution Order

1. preflight
2. build
3. unit
4. integration
5. benchmark smoke

Canonical commands:

- `powershell -ExecutionPolicy Bypass -File harness/scripts/run_harness_preflight.ps1`
- `powershell -ExecutionPolicy Bypass -File harness/scripts/run_harness_cycle.ps1`
- `powershell -ExecutionPolicy Bypass -File harness/scripts/generate_retry_prompt.ps1`
- `powershell -ExecutionPolicy Bypass -File harness/scripts/dispatch_retry_prompt.ps1`
- `powershell -ExecutionPolicy Bypass -File harness/scripts/run_retry_handoff.ps1`

## Failure Classes

- `compile`: compiler or linker failure
- `interface`: signature or contract mismatch
- `logic`: execution succeeded but the result is wrong
- `missing-test`: behavior changed without matching validation
- `environment`: tool, path, permission, or repository-root safety problem

## Report Format

- commands run
- pass or fail
- failure class
- responsible module or owner
- next action
- whether a retry prompt was created

## Project Focus

- preserve the harness while the product becomes a TypeScript and Next.js service
- route GitHub integration failures toward `agent-data`
- route compare-session rule failures toward `agent-domain`
- route workspace and editor failures toward `agent-ui`
- route auth, routing, and startup failures toward `agent-runtime`
