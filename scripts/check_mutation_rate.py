#!/usr/bin/env python3
"""
Parse mutmut results and enforce a minimum mutation kill rate.

Exit codes:
  0 — kill rate meets threshold
  1 — kill rate below threshold or no mutations generated

Used by .github/workflows/mutation.yml after `mutmut run` completes.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys


def main() -> int:
    min_rate = float(os.getenv("MIN_RATE", "80"))

    result = subprocess.run(["mutmut", "results"], capture_output=True, text=True)
    text = result.stdout + result.stderr

    # Primary: "N out of M mutants survived"
    m = re.search(r"(\d+) out of (\d+) mutants survived", text)
    if m:
        survived = int(m.group(1))
        total    = int(m.group(2))
        killed   = total - survived
    else:
        # Fallback: count emoji markers in per-line output
        killed   = text.count("🎉") + text.count("killed")
        survived = text.count("🙁") + text.count("survived")
        total    = killed + survived

    if total == 0:
        print("ERROR: No mutations generated — check the --paths-to-mutate argument.", file=sys.stderr)
        return 1

    kill_rate = killed / total * 100

    print(f"Mutation kill rate: {kill_rate:.1f}%  ({killed}/{total} killed, {survived} survived)")

    # Write structured output for the GitHub Actions step summary
    summary_file = os.getenv("GITHUB_STEP_SUMMARY", "")
    if summary_file:
        status = "✅ PASS" if kill_rate >= min_rate else "❌ FAIL"
        with open(summary_file, "a") as f:
            f.write(f"## Mutation Testing Results\n\n")
            f.write(f"| Metric | Value |\n|--------|-------|\n")
            f.write(f"| Kill rate | **{kill_rate:.1f}%** |\n")
            f.write(f"| Killed | {killed} |\n")
            f.write(f"| Survived | {survived} |\n")
            f.write(f"| Total | {total} |\n")
            f.write(f"| Threshold | {min_rate:.0f}% |\n")
            f.write(f"| Status | {status} |\n")

    # Write outputs for downstream steps
    github_output = os.getenv("GITHUB_OUTPUT", "")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"kill_rate={kill_rate:.1f}\n")
            f.write(f"killed={killed}\n")
            f.write(f"survived={survived}\n")
            f.write(f"total={total}\n")
            f.write(f"passed={'true' if kill_rate >= min_rate else 'false'}\n")

    if kill_rate < min_rate:
        print(
            f"FAIL: {kill_rate:.1f}% is below the {min_rate:.0f}% minimum threshold.\n"
            f"Run `mutmut results` then `mutmut show <id>` to inspect surviving mutants.",
            file=sys.stderr,
        )
        return 1

    print(f"PASS: {kill_rate:.1f}% meets the {min_rate:.0f}% threshold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
