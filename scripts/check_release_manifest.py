#!/usr/bin/env python3
"""Validate the explicit allow-list for files approved for public dataset release."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "datasets" / "release-manifest.json"
REQUIRED = ("dataset_id", "name", "status", "license", "source_url", "attribution", "reviewed_on", "files")
APPROVED = "approved_for_public_release"

def main():
    try:
        doc = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FAIL: cannot load {MANIFEST.relative_to(ROOT)}: {exc}")
        return 1
    if doc.get("schema_version") != 1 or not isinstance(doc.get("datasets"), list):
        print("FAIL: expected schema_version=1 and datasets array")
        return 1

    tracked = set(subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines())
    ids = set()
    errors = []
    for i, item in enumerate(doc["datasets"]):
        label = f"datasets[{i}]"
        if not isinstance(item, dict):
            errors.append(f"{label} must be an object")
            continue
        for key in REQUIRED:
            if key not in item or item[key] in ("", None, []):
                errors.append(f"{label}: missing {key}")
        dsid = item.get("dataset_id", "")
        if dsid in ids:
            errors.append(f"{label}: duplicate dataset_id {dsid}")
        ids.add(dsid)
        if item.get("status") != APPROVED:
            errors.append(f"{dsid}: status must be {APPROVED}")
        for key in ("license", "source_url", "attribution", "reviewed_on"):
            if not isinstance(item.get(key), str) or not item[key].strip():
                errors.append(f"{dsid}: {key} must be non-empty text")
        files = item.get("files")
        if not isinstance(files, list) or not files:
            errors.append(f"{dsid}: files must be a non-empty list")
            continue
        for rel in files:
            if not isinstance(rel, str) or not rel.startswith("datasets/release_data/") or ".." in Path(rel).parts:
                errors.append(f"{dsid}: release file must be under datasets/release_data/: {rel!r}")
                continue
            if not (ROOT / rel).is_file():
                errors.append(f"{dsid}: missing file {rel}")
            if rel not in tracked:
                errors.append(f"{dsid}: file is not git-tracked: {rel}")

    if errors:
        print("FAIL: public dataset release allow-list rejected")
        for error in errors:
            print(f" - {error}")
        return 1
    print(f"PASS: {len(doc['datasets'])} explicitly approved public dataset entries validated.")
    if not doc["datasets"]:
        print("NOTE: allow-list is empty; no dataset payload is approved for public release.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
