#!/usr/bin/env python3
"""Validate a locally reviewed FAO crop-calendar CSV before any database import.

This is deliberately offline and read-only. It does not claim FAO endorsement,
automatic redistribution permission, or verified crop calendars.

Usage:
 python3 scripts/validate-fao-calendar.py path/to/reviewed.csv --field-id UUID
"""
import argparse
import csv
import datetime as dt
import json
import sys
import uuid
from pathlib import Path

REQUIRED = ("field_id", "country", "region", "crop", "planting_start_month",
            "planting_end_month", "harvest_start_month", "harvest_end_month",
            "source_url", "source_title", "license", "permission_note",
            "reviewed_on")
MONTH_FIELDS = ("planting_start_month", "planting_end_month",
                "harvest_start_month", "harvest_end_month")


def validate(path: Path, field_id: str | None) -> int:
    try:
        if field_id:
            uuid.UUID(field_id)
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                raise ValueError("CSV has no header")
            missing = sorted(set(REQUIRED) - set(reader.fieldnames))
            if missing:
                raise ValueError("missing columns: " + ", ".join(missing))
            errors = []
            count = 0
            for line, row in enumerate(reader, 2):
                count += 1
                for col in REQUIRED:
                    if not (row.get(col) or "").strip():
                        errors.append(f"line {line}: missing {col}")
                try:
                    uuid.UUID((row.get("field_id") or "").strip())
                except ValueError:
                    errors.append(f"line {line}: invalid field_id")
                if field_id and row.get("field_id", "").strip() != field_id:
                    errors.append(f"line {line}: field_id differs from selected field")
                for col in MONTH_FIELDS:
                    try:
                        month = int((row.get(col) or "").strip())
                        if not 1 <= month <= 12:
                            raise ValueError()
                    except ValueError:
                        errors.append(f"line {line}: {col} must be integer 1..12")
                try:
                    dt.date.fromisoformat((row.get("reviewed_on") or "").strip())
                except ValueError:
                    errors.append(f"line {line}: reviewed_on must be YYYY-MM-DD")
                url = (row.get("source_url") or "").strip()
                if url and not url.startswith("https://"):
                    errors.append(f"line {line}: source_url must be HTTPS")
                permission = (row.get("permission_note") or "").strip()
                if permission and permission.lower() in ("unknown", "pending", "n/a", "none"):
                    errors.append(f"line {line}: explicit permission provenance required")
                if len(errors) >= 100:
                    errors.append("validation stopped after 100 errors")
                    break
        if count == 0:
            errors.append("CSV has no data rows")
        print(json.dumps({"file": str(path), "rows_checked": count,
                          "valid": not errors, "errors": errors}, indent=2))
        return 0 if not errors else 1
    except (OSError, UnicodeError, ValueError, csv.Error) as exc:
        print(json.dumps({"valid": False, "error": str(exc)}, indent=2))
        return 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", type=Path)
    parser.add_argument("--field-id", help="Require every row to match this field UUID")
    args = parser.parse_args()
    sys.exit(validate(args.csv_file, args.field_id))
