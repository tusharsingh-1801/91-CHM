#!/usr/bin/env python3
"""Conservative CHM dataset release gate. Uses only Python standard library."""
import json
import subprocess
import sys
from pathlib import PurePosixPath

POLICY = "datasets/dataset-policy.json"

def main() -> int:
    with open(POLICY, encoding="utf-8") as f:
        policy = json.load(f)

    try:
        tracked = subprocess.check_output(
            ["git", "ls-files", "-z"], text=True
        ).split("\0")
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"ERROR: cannot inspect Git index: {exc}")
        return 2

    blocked_words = tuple(x.lower() for x in policy["restricted_or_unverified_keywords"])
    raw_exts = {x.lower() for x in policy["raw_data_extensions"]}
    raw_dirs = tuple(x.lower() for x in policy["raw_data_directories"])
    failures = []
    warnings = []

    for name in filter(None, tracked):
        lower = name.lower()
        path = PurePosixPath(lower)

        if lower == POLICY.lower() or lower.startswith(".github/") or lower.startswith("scripts/"):
            continue

        if any(word in lower for word in blocked_words):
            if path.suffix in raw_exts or any(lower.startswith(d) for d in raw_dirs):
                failures.append(f"{name}: raw data path matches a restricted/unverified dataset keyword")
            elif path.suffix in {".md", ".txt", ".json", ".yml", ".yaml"}:
                warnings.append(f"{name}: filename references a restricted/unverified dataset; review if it contains copied data")

        if any(lower.startswith(d) for d in raw_dirs) and path.suffix in raw_exts:
            failures.append(f"{name}: raw dataset file is tracked in a public raw-data directory")

    print("CHM dataset release-gate report")
    print(f"Tracked files inspected: {len([x for x in tracked if x])}")
    print(f"Approved dataset entries: {len(policy.get('approved_datasets', []))}")
    for item in policy.get("approved_datasets", []):
        print(f"  - {item['id']}: {item['status']} (attribution required: {item['attribution_required']})")

    for warning in warnings:
        print(f"WARNING: {warning}")
    if failures:
        print("\nFAIL: dataset release gate blocked this commit:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print("\nPASS: no tracked raw files in configured restricted paths were detected.")
    print("NOTE: this path-based check cannot verify image-level copyright or licence validity.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
