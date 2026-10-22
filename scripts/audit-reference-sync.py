#!/usr/bin/env python3
"""Audit TerraScope's local reference dataset sync report without external dependencies.

Usage:
    python3 scripts/audit-reference-sync.py
    python3 scripts/audit-reference-sync.py path/to/sync-report.json
Exit code 0 means every provider is integrated; 1 means incomplete; 2 means invalid report.
"""
import json
import sys
from pathlib import Path

EXPECTED = ("worldcover", "chirps", "soilgrids", "worldcereal", "cropharvest", "fao-calendar")
REPORT = Path(".local/datasets/reference/sync-report.json")


def audit(path: Path) -> int:
    if not path.is_file():
        print(f"ERROR: sync report not found: {path}", file=sys.stderr)
        return 2
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read sync report: {exc}", file=sys.stderr)
        return 2
    results = data.get("results")
    if not isinstance(results, list):
        print("ERROR: report.results must be a list", file=sys.stderr)
        return 2
    print(f"Reference sync report: {path}")
    print(f"Created: {data.get('created_at', 'unknown')}")
    print(f"{'Provider':<16} {'Status':<19} {'Persisted':<10} {'Evidence'}")
    print("-" * 88)
    incomplete = False
    for provider in EXPECTED:
        matches = [r for r in results if isinstance(r, dict) and r.get("provider") == provider]
        if not matches:
            print(f"{provider:<16} {'missing':<19} {'no':<10} no result")
            incomplete = True
            continue
        for record in matches:
            status = str(record.get("status", "unknown"))
            persisted = record.get("persisted") is True
            payload = record.get("payload") or {}
            if not isinstance(payload, dict):
                payload = {}
            evidence = ""
            if provider == "worldcover":
                evidence = f"coverage={payload.get('coverage_percent', '?')}%"
            elif provider == "chirps":
                evidence = f"days={len(payload.get('daily', [])) if isinstance(payload.get('daily'), list) else '?'}"
            elif provider == "soilgrids":
                evidence = f"variables={len(payload.get('variables', [])) if isinstance(payload.get('variables'), list) else '?'}"
            elif provider == "cropharvest":
                evidence = f"labels={payload.get('label_count', '?')}; trained model not implied"
            elif provider == "worldcereal":
                evidence = "AOI raster required" if status == "not_configured" else "check AOI raster provenance"
            elif provider == "fao-calendar":
                evidence = "licensed CSV required" if status == "manual" else "check per-record permission"
            print(f"{provider:<16} {status:<19} {str(persisted).lower():<10} {evidence}")
            if status != "integrated" or not persisted:
                incomplete = True
    print("\nNote: persisted=true can mean a status record was saved, not that data was integrated.")
    print("RESULT:", "INCOMPLETE" if incomplete else "ALL PROVIDERS REPORTED INTEGRATED")
    return 1 if incomplete else 0


if __name__ == "__main__":
    raise SystemExit(audit(Path(sys.argv[1]) if len(sys.argv) > 1 else REPORT))
