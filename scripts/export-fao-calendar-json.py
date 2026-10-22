#!/usr/bin/env python3
"""Emit reviewed FAO calendar rows as JSON only after CSV validation.

No database changes. This file is called by the PostgreSQL importer.
"""
import csv
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("fao_validator", ROOT / "validate-fao-calendar.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def main():
    if len(sys.argv) not in (2, 3):
        print("usage: export-fao-calendar-json.py reviewed.csv [field-uuid]", file=sys.stderr)
        return 2
    from contextlib import redirect_stdout
    import io
    source = Path(sys.argv[1])
    output = io.StringIO()
    with redirect_stdout(output):
        status = validator.validate(source, sys.argv[2] if len(sys.argv) == 3 else None)
    if status:
        print(output.getvalue(), file=sys.stderr)
        return status
    with source.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    print(json.dumps(rows, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
