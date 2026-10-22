#!/usr/bin/env python3
"""Regression tests for the FAO crop-calendar CSV validator (stdlib only)."""
import csv
import importlib.util
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

SCRIPT = Path(__file__).with_name("validate-fao-calendar.py")
spec = importlib.util.spec_from_file_location("fao_validator", SCRIPT)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)

FIELD_ID = "15728878-9cb6-41af-bd0c-f2660426198b"
VALID = {
    "field_id": FIELD_ID,
    "country": "India",
    "region": "Test region",
    "crop": "Test crop",
    "planting_start_month": "6",
    "planting_end_month": "7",
    "harvest_start_month": "10",
    "harvest_end_month": "11",
    "source_url": "https://example.org/source",
    "source_title": "TEST DATA ONLY - not an FAO record",
    "license": "TEST ONLY",
    "permission_note": "TEST ONLY - not for import",
    "reviewed_on": "2026-10-22",
}


class ValidatorTests(unittest.TestCase):
    def check(self, rows, columns=None, field_id=FIELD_ID):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "calendar.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=columns or list(VALID))
                writer.writeheader()
                writer.writerows(rows)
            with redirect_stdout(io.StringIO()) as output:
                result = validator.validate(path, field_id)
            return result, output.getvalue()

    def test_valid_shape(self):
        result, output = self.check([VALID])
        self.assertEqual(result, 0, output)

    def test_wrong_field(self):
        row = dict(VALID, field_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        result, output = self.check([row])
        self.assertEqual(result, 1)
        self.assertIn("differs", output)

    def test_month_out_of_range(self):
        row = dict(VALID, harvest_end_month="13")
        result, output = self.check([row])
        self.assertEqual(result, 1)
        self.assertIn("1..12", output)

    def test_missing_permission(self):
        row = dict(VALID, permission_note="pending")
        result, output = self.check([row])
        self.assertEqual(result, 1)
        self.assertIn("permission", output)

    def test_empty_rows(self):
        result, output = self.check([])
        self.assertEqual(result, 1)
        self.assertIn("no data rows", output)

    def test_missing_column(self):
        columns = [key for key in VALID if key != "license"]
        row = {key: VALID[key] for key in columns}
        result, output = self.check([row], columns=columns)
        self.assertEqual(result, 2)
        self.assertIn("missing columns", output)


if __name__ == "__main__":
    unittest.main()
