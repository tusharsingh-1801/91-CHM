"""Normalize source APY CSVs to JSON lines for the bounded PostgreSQL importer."""
import csv
import json
import sys

source, path = sys.argv[1:3]
urls = {
    "des": "https://ckandev.indiadataportal.com/dataset/area-production-yield-apy/resource/f980409d-49a2-42ae-9eb0-182365005c04",
    "upag": "https://ckandev.indiadataportal.com/dataset/area-production-yield-apy/resource/6f70d961-3a4f-4caa-b08f-f72f708791e1",
}


def value(row, key):
    result = row.get(key)
    return result.strip() if result and result.strip() else None


def number(raw):
    if raw is None:
        return None
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


with open(path, "r", encoding="utf-8-sig", newline="") as handle:
    for row in csv.DictReader(handle):
        state = value(row, "state_name")
        district = value(row, "district_name")
        crop = value(row, "crop_name")
        year = value(row, "year")
        row_id = value(row, "id")
        if not all((state, district, crop, year, row_id)):
            continue
        des = source == "des"
        record = {
            "source_id": source,
            "source_row_id": row_id,
            "crop_year": year,
            "state_name": state,
            "state_code": value(row, "state_code"),
            "district_name": district,
            "district_code": value(row, "district_code"),
            "season": value(row, "season"),
            "crop_name": crop,
            "crop_code": value(row, "crop_code"),
            "crop_category": value(row, "crop_type") if des else value(row, "crop_category"),
            "area_value": number(value(row, "area")),
            "area_unit": value(row, "area_unit") or "Hectare",
            "production_value": number(value(row, "production")),
            "production_unit": value(row, "production_unit") or "Tonnes",
            "yield_value": number(value(row, "yield")),
            "yield_unit": value(row, "yield_unit") or "kg/ha",
            "source_url": urls[source],
            "license": "Open Data Commons Attribution License (as listed by India Data Portal)",
            "source_record": row,
        }
        print(json.dumps(record, ensure_ascii=True, separators=(",", ":")))
