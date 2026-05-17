#!/usr/bin/env bash
set -u

SKIP_RETRY_PROMPT=0
if [ "${1:-}" = "--skip-retry-prompt" ]; then
    SKIP_RETRY_PROMPT=1
fi

ROOT_DIR="$(bash "$(dirname "$0")/detect_root.sh")"
if [ -f "$ROOT_DIR/scripts/run_build.sh" ]; then
    SCRIPT_PREFIX="scripts"
    REPORT_PREFIX="reports"
else
    SCRIPT_PREFIX="harness/scripts"
    REPORT_PREFIX="harness/reports"
fi

LOG_DIR="$ROOT_DIR/$REPORT_PREFIX/logs"
LATEST_REPORT="$ROOT_DIR/$REPORT_PREFIX/latest_report.md"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$LOG_DIR"
cd "$ROOT_DIR" || exit 1

BUILD_LOG="$LOG_DIR/${TIMESTAMP}_build.log"
UNIT_LOG="$LOG_DIR/${TIMESTAMP}_unit.log"
INTEGRATION_LOG="$LOG_DIR/${TIMESTAMP}_integration.log"
BENCH_LOG="$LOG_DIR/${TIMESTAMP}_benchmark.log"

BUILD_STATUS="pass"
UNIT_STATUS="pass"
INTEGRATION_STATUS="pass"
BENCHMARK_STATUS="pass"
OVERALL_STATUS="pass"
FAILURE_TYPE="none"
FAILURE_MODULE="none"
NEXT_OWNER="none"
NEXT_TASK="none"
RETRY_PROMPT_STATUS="not_needed"
RETRY_PROMPT_DETAIL="none"

run_step() {
    local name="$1"
    local command="$2"
    local log_file="$3"

    if bash -lc "$command" >"$log_file" 2>&1; then
        return 0
    fi

    return 1
}

classify_failure() {
    local log_file="$1"

    if grep -Eqi "command not found|No such file|not recognized|Access is denied|Permission denied|UnauthorizedAccessException|EPERM|EACCES" "$log_file"; then
        FAILURE_TYPE="environment"
    elif grep -Eqi "error:|undefined reference|ld:" "$log_file"; then
        FAILURE_TYPE="compile"
    elif grep -Eqi "mismatch|incompatible|conflict" "$log_file"; then
        FAILURE_TYPE="interface"
    else
        FAILURE_TYPE="logic"
    fi
}

if ! run_step "build" "bash $SCRIPT_PREFIX/run_build.sh" "$BUILD_LOG"; then
    BUILD_STATUS="fail"
    OVERALL_STATUS="fail"
    FAILURE_MODULE="build"
    NEXT_OWNER="manager-main"
    NEXT_TASK="fix build failure and reconcile interfaces"
    classify_failure "$BUILD_LOG"
else
    if ! run_step "unit" "bash $SCRIPT_PREFIX/run_unit.sh" "$UNIT_LOG"; then
        UNIT_STATUS="fail"
        OVERALL_STATUS="fail"
        FAILURE_MODULE="tests/unit"
        NEXT_OWNER="agent-tests"
        NEXT_TASK="fix or add unit coverage for failing behavior"
        classify_failure "$UNIT_LOG"
    elif ! run_step "integration" "bash $SCRIPT_PREFIX/run_integration.sh" "$INTEGRATION_LOG"; then
        INTEGRATION_STATUS="fail"
        OVERALL_STATUS="fail"
        FAILURE_MODULE="tests/integration"
        NEXT_OWNER="manager-main"
        NEXT_TASK="trace integration failure and reassign affected module"
        classify_failure "$INTEGRATION_LOG"
    elif ! run_step "benchmark" "bash $SCRIPT_PREFIX/run_benchmark_smoke.sh" "$BENCH_LOG"; then
        BENCHMARK_STATUS="fail"
        OVERALL_STATUS="fail"
        FAILURE_MODULE="benchmark-smoke"
        NEXT_OWNER="manager-harness"
        NEXT_TASK="stabilize benchmark smoke path"
        classify_failure "$BENCH_LOG"
    fi
fi

cat >"$LATEST_REPORT" <<EOF
# Latest Harness Report

## Summary

- status: $OVERALL_STATUS
- last_cycle: $TIMESTAMP

## Results

- build: $BUILD_STATUS
- unit: $UNIT_STATUS
- integration: $INTEGRATION_STATUS
- benchmark_smoke: $BENCHMARK_STATUS

## Logs

- build: $REPORT_PREFIX/logs/$(basename "$BUILD_LOG")
- unit: $REPORT_PREFIX/logs/$(basename "$UNIT_LOG")
- integration: $REPORT_PREFIX/logs/$(basename "$INTEGRATION_LOG")
- benchmark_smoke: $REPORT_PREFIX/logs/$(basename "$BENCH_LOG")

## Failures

- type: $FAILURE_TYPE
- module: $FAILURE_MODULE

## Next Actions

- owner: $NEXT_OWNER
- task: $NEXT_TASK
EOF

if [ "$OVERALL_STATUS" != "pass" ]; then
    if [ "$SKIP_RETRY_PROMPT" -eq 0 ]; then
        if RETRY_OUTPUT="$(bash $SCRIPT_PREFIX/generate_retry_prompt.sh 2>&1)"; then
            RETRY_PROMPT_STATUS="generated"
            RETRY_PROMPT_DETAIL="$(printf '%s' "$RETRY_OUTPUT" | tr '\r\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')"
        else
            RETRY_PROMPT_STATUS="error"
            RETRY_PROMPT_DETAIL="$(printf '%s' "$RETRY_OUTPUT" | tr '\r\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')"
        fi
    else
        RETRY_PROMPT_STATUS="skipped"
        RETRY_PROMPT_DETAIL="retry prompt generation skipped by option"
    fi
fi

printf "harness cycle status: %s\n" "$OVERALL_STATUS"
printf "latest report: %s\n" "$LATEST_REPORT"
if [ "$OVERALL_STATUS" != "pass" ]; then
    printf "retry prompt: %s\n" "$RETRY_PROMPT_STATUS"
    printf "retry prompt detail: %s\n" "$RETRY_PROMPT_DETAIL"
fi

if [ "$OVERALL_STATUS" != "pass" ]; then
    exit 1
fi
