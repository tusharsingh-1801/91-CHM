#!/usr/bin/env python3
"""Conservative CHM dataset release gate. Standard library only."""
import json
import subprocess
import sys
from pathlib import PurePosixPath

POLICY = "datasets/dataset-policy.json"
TEXT_EXTS = {".md", ".txt", ".json", ".yml", ".yaml", ".csv"}

def main() -> int:
    try:
        with open(POLICY, encoding="utf-8") as f:
            policy = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read valid policy {POLICY}: {exc}")
        return 2

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
    failures, warnings = [], []

    for name in filter(None, tracked):
        lower = name.lower()
        path = PurePosixPath(lower)
        if lower == POLICY.lower():
            continue

        is_raw = path.suffix in raw_exts
        in_raw_dir = any(lower.startswith(d) for d in raw_dirs)
        has_restricted_name = any(word in lower for word in blocked_words)

        # Raw data is never permitted in configured public raw directories.
        if is_raw and in_raw_dir:
            failures.append(f"{name}: raw data is tracked in a configured public raw-data directory")
        # Catch dataset-named raw files wherever they are placed, not just under data/raw.
        elif is_raw and has_restricted_name:
            failures.append(f"{name}: raw file name matches a restricted/unverified dataset")
        elif has_restricted_name and path.suffix in TEXT_EXTS:
            warnings.append(f"{name}: references a restricted/unverified dataset; confirm this is metadata/notice only")

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

    print("\nPASS: no configured public raw-data paths or restricted-name raw files detected.")
    print("LIMITATION: path-based check only; it does not inspect file contents, embedded metadata, image-level rights, or licence validity.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
