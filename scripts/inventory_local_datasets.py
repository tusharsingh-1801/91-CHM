#!/usr/bin/env python3
"""Inventory ignored local CHM datasets without uploading their contents.

Run from the repository root:
    python scripts/inventory_local_datasets.py > .local/dataset_inventory.json

The report contains relative paths, sizes, extensions and SHA-256 hashes only.
It does not copy, upload, or read file contents into the report.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default=".local/datasets",
        help="Dataset directory to scan (default: .local/datasets)",
    )
    args = parser.parse_args()
    root = Path(args.root)

    if not root.exists() or not root.is_dir():
        parser.error(f"dataset directory does not exist: {root}")
    if root.is_symlink():
        parser.error("refusing to scan a symlink as the dataset root")

    records = []
    errors = []
    for current, dirs, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        dirs[:] = sorted(
            name for name in dirs
            if not (current_path / name).is_symlink()
        )
        for name in sorted(files):
            path = current_path / name
            if path.is_symlink() or not path.is_file():
                continue
            relative = path.relative_to(root).as_posix()
            try:
                records.append({
                    "path": relative,
                    "dataset": relative.split("/", 1)[0],
                    "size_bytes": path.stat().st_size,
                    "extension": path.suffix.lower(),
                    "sha256": sha256_file(path),
                })
            except OSError as exc:
                errors.append({"path": relative, "error": str(exc)})

    counts = Counter(item["dataset"] for item in records)
    report = {
        "schema_version": 1,
        "root": root.as_posix(),
        "file_count": len(records),
        "total_size_bytes": sum(item["size_bytes"] for item in records),
        "datasets": [
            {"name": name, "file_count": counts[name]}
            for name in sorted(counts)
        ],
        "files": records,
        "errors": errors,
        "note": "Paths are relative to root. No dataset file contents are included.",
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
