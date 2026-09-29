# Shared helpers for run.sh; sourced, not executed. Needs HERE, OUT and LOG.
#
# Phases keep running after failures, so an unexpected checker failure must not vanish. A
# checker command that exits nonzero (for example, one that crashed before recording a row)
# is recorded as FAIL. It also leaves two independent traces: CHECKER_FAILED in this shell, for
# direct calls, and the checker-error file, which command substitutions and other subshells can
# still create. finish() exits nonzero if either exists, even when recording the FAIL row itself
# failed. summary's own nonzero exit reports failures that are already recorded, and stays as is.

CHECKER_FAILED=0
CHECKER_ERROR_FILE="$OUT/checker-error"

check() {
  python3 "$HERE/check.py" --log "$LOG" "$@"
  local rc=$?
  if [[ $rc -ne 0 && $1 != summary ]]; then
    CHECKER_FAILED=1
    printf '%s %s exited %s\n' "$(date -u +%FT%TZ)" "$1" "$rc" >> "$CHECKER_ERROR_FILE" 2>/dev/null
    printf '{"phase": "harness", "check": "checker command %s", "status": "FAIL", "detail": "exit %s"}\n' \
      "$1" "$rc" >> "$LOG" 2>/dev/null
    echo "checker command '$1' failed with exit $rc" >&2
  fi
  return $rc
}

say() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$OUT/harness.log"; }

finish() {  # finish <evidence level>: write the summary and exit with the truthful overall status
  check summary "$OUT" "$1"
  local rc=$?
  if [[ $CHECKER_FAILED -ne 0 || -e "$CHECKER_ERROR_FILE" ]]; then
    echo "QA-IOS-01: a checker command failed; the run is not a pass (see $CHECKER_ERROR_FILE)" >&2
    rc=1
  fi
  exit $(( rc == 0 ? 0 : 1 ))
}
