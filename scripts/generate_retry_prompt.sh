#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LATEST_REPORT="$ROOT_DIR/harness/reports/latest_report.md"
TEMPLATE_FILE="$ROOT_DIR/harness/reports/retry_prompt_template.md"
OUTPUT_DIR="$ROOT_DIR/harness/reports/retry_prompts"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$OUTPUT_DIR"

if [ ! -f "$LATEST_REPORT" ]; then
    printf "latest report not found: %s\n" "$LATEST_REPORT" >&2
    exit 1
fi

extract_value() {
    local key="$1"
    grep -E "^- ${key}:" "$LATEST_REPORT" | head -n 1 | sed -E "s/^- ${key}: *//"
}

STATUS="$(extract_value "status")"
FAILURE_TYPE="$(extract_value "type")"
FAILURE_MODULE="$(extract_value "module")"
NEXT_OWNER="$(extract_value "owner")"
NEXT_TASK="$(extract_value "task")"

if [ -z "$STATUS" ]; then
    printf "could not parse latest report\n" >&2
    exit 1
fi

if [ "$STATUS" = "pass" ] || [ "$STATUS" = "partial-pass" ]; then
    printf "latest report is pass; retry prompt not needed\n"
    exit 0
fi

if [ -z "$NEXT_OWNER" ] || [ "$NEXT_OWNER" = "none" ]; then
    NEXT_OWNER="manager-main"
fi

if [ -z "$FAILURE_TYPE" ] || [ "$FAILURE_TYPE" = "none" ]; then
    FAILURE_TYPE="logic"
fi

if [ -z "$FAILURE_MODULE" ] || [ "$FAILURE_MODULE" = "none" ]; then
    FAILURE_MODULE="unknown"
fi

if [ -z "$NEXT_TASK" ] || [ "$NEXT_TASK" = "none" ]; then
    NEXT_TASK="inspect latest harness failure and propose a focused fix"
fi

case "$NEXT_OWNER" in
    agent-runtime)
        VALIDATION="make integration && make benchmark-smoke"
        ;;
    agent-query)
        VALIDATION="make unit && make integration"
        ;;
    agent-storage)
        VALIDATION="make unit && make integration"
        ;;
    agent-index)
        VALIDATION="make unit && make benchmark-smoke"
        ;;
    agent-tests)
        VALIDATION="make unit && make integration"
        ;;
    manager-harness)
        VALIDATION="bash harness/scripts/run_harness_cycle.sh --skip-retry-prompt"
        ;;
    *)
        VALIDATION="make test"
        ;;
esac

OUTPUT_FILE="$OUTPUT_DIR/${TIMESTAMP}_${NEXT_OWNER}.md"

cat >"$OUTPUT_FILE" <<EOF
# Retry Prompt

## Owner

- agent: $NEXT_OWNER

## Failure Type

- type: $FAILURE_TYPE

## Affected Area

- files: inspect harness/reports/latest_report.md and related logs
- module: $FAILURE_MODULE

## What Failed

- summary: The latest harness cycle did not pass and has been assigned to $NEXT_OWNER.

## Required Fix

- task: $NEXT_TASK

## Validation Needed

- command: $VALIDATION
- expected: the assigned failure is resolved and the next harness cycle moves forward
EOF

printf "generated retry prompt: %s\n" "$OUTPUT_FILE"
printf "template reference: %s\n" "$TEMPLATE_FILE"
