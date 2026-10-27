#!/usr/bin/env python3
"""Acquire a public Telangana crop-health research copy locally, not into Git."""
import csv
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / ".local" / "datasets" / "ground-truth" / "telangana"
SOURCE = "https://raw.githubusercontent.com/pranavmyname/zindi_crop_health/main/train.csv"
MAX_BYTES = 12 * 1024 * 1024
REQUIRED = {"FarmID", "category", "Crop", "State", "SDate", "HDate", "geometry"}

def main():
    if os.getenv("CHM_ACCEPT_TELANGANA_TERMS") != "1":
        raise SystemExit("Review dataset provenance, upstream terms and field-location privacy; set CHM_ACCEPT_TELANGANA_TERMS=1 to acquire locally.")
    DEST.mkdir(parents=True, exist_ok=True)
    request = Request(SOURCE, headers={"User-Agent": "TerraScope-acquisition/1.0"})
    with urlopen(request, timeout=60) as response:
        if int(response.headers.get("Content-Length") or 0) > MAX_BYTES:
            raise SystemExit("Dataset exceeds size limit")
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise SystemExit("Dataset exceeds size limit")
    text = data.decode("utf-8-sig")
    import io
    reader = csv.DictReader(io.StringIO(text))
    if not REQUIRED.issubset(reader.fieldnames or []):
        raise SystemExit("Unexpected columns: upstream dataset schema changed")
    rows = list(reader)
    if not rows or any(not row.get("FarmID") or not row.get("category") for row in rows):
        raise SystemExit("Missing records or required labels")
    if any(row.get("State", "").strip().lower() != "telangana" for row in rows):
        raise SystemExit("Unexpected geography")
    path = DEST / "train.csv"
    temp = DEST / "train.csv.tmp"
    temp.write_bytes(data)
    temp.replace(path)
    receipt = {
        "source": SOURCE, "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data), "records": len(rows),
        "columns": reader.fieldnames,
        "usage": "research-only, local restricted copy; field locations must not be published",
        "verification": "upstream public research copy; not independently verified against ADeX original",
        "labels": "field-survey categories; confirm definitions and annotation reliability before accuracy claims",
    }
    (DEST / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"path": str(path), "records": len(rows), "sha256": receipt["sha256"]}, indent=2))

if __name__ == "__main__":
    main()
