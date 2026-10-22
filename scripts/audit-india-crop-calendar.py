#!/usr/bin/env python3
"""Audit locally acquired crop calendars without inventing Telangana crop dates.

Usage: python3 scripts/audit-india-crop-calendar.py
Read-only: never writes to PostgreSQL or alters the downloaded datasets.
"""
import csv
import io
import json
from pathlib import Path
from zipfile import ZipFile, is_zipfile

ROOT = Path(".local/datasets/reference")
FIELD_REGION = "Telangana"
results = []

for level in ("gaul0", "gaul1"):
    path = ROOT / "jrc-asap" / ("crop_calendar_" + level + ".zip")
    entry = {"source": "JRC ASAP " + level, "path": str(path), "status": "missing"}
    if path.exists() and is_zipfile(path):
        with ZipFile(path) as archive:
            name = next((n for n in archive.namelist() if n.lower().endswith(".csv")), None)
            if name:
                with archive.open(name) as raw:
                    reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig"), delimiter=";")
                    rows = list(reader)
                india = [r for r in rows if r.get("name0_shr", "").strip().casefold() == "india"]
                entry.update(status="inspected", total_rows=len(rows),
                             india_rows=len(india), telangana_rows=sum(
                                 FIELD_REGION.casefold() == r.get("name1_shr", "").strip().casefold()
                                 for r in india))
    results.append(entry)

pdf = ROOT / "india-crop-calendar" / "official-crop-calendar.pdf"
txt = ROOT / "india-crop-calendar" / "crop-calendar-tables.txt"
entry = {"source": "Government of India historical crop calendar",
         "pdf_path": str(pdf), "text_path": str(txt),
         "status": "downloaded" if pdf.exists() else "missing"}
if txt.exists():
    data = txt.read_text(encoding="utf-8", errors="replace").casefold()
    entry.update(status="inspected", telangana_mentions=data.count("telangana"),
                 andhra_pradesh_mentions=data.count("andhra pradesh"))
results.append(entry)

supported = any(
    r.get("telangana_rows", 0) > 0 or r.get("telangana_mentions", 0) > 0
    for r in results
)
print(json.dumps({"sources": results,
                  "telangana_calendar_status": "manual_source_review_required" if supported else "unavailable",
                  "database_import_performed": False,
                  "note": "No verified Telangana crop-specific planting/harvest rows are established by this audit. "
                          "Do not substitute historical Andhra Pradesh or another country's calendar."},
                 indent=2))
