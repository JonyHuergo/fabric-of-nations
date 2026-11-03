#!/usr/bin/env bash
# Usage: docs/perf/check-trace.sh [days]  — compare the current build's trace with the baseline.
days="${1:-8}"
cd "$(dirname "$0")/../.."
node --max-old-space-size=4096 packages/bench/dist/perfTrace.js "$days" > docs/perf/trace-current.txt 2>&1
if diff <(head -n $((days + 1)) docs/perf/trace-baseline.txt) docs/perf/trace-current.txt > /dev/null; then
  echo "trace identical for $days days"
else
  echo "TRACE DIFFERS"; diff <(head -n $((days + 1)) docs/perf/trace-baseline.txt) docs/perf/trace-current.txt | head -6
fi
