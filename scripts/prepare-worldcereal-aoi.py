#!/usr/bin/env python3
"""Verify an official WorldCereal AOI GeoTIFF and generate a local manifest.

Requires rasterio in the project's Python environment.
Usage:
 python3 scripts/prepare-worldcereal-aoi.py /path/to/official-export.tif \
   --field-id 15728878-9cb6-41af-bd0c-f2660426198b \
   --source-url https://... --product temporarycrops --year 2021
Does not invent or download ESA products. Output remains in ignored .local/.
"""
import argparse
import datetime as dt
import hashlib
import json
import sys
import uuid
from pathlib import Path

PRODUCTS = {"temporarycrops", "maize", "wintercereals", "irrigation"}


def verify(path, field_id, source_url, product, year, output):
    uuid.UUID(field_id)
    if product not in PRODUCTS:
        raise ValueError("unsupported WorldCereal product")
    if year != 2021:
        raise ValueError("only the verified global 2021 product is supported")
    if not source_url.startswith("https://"):
        raise ValueError("official HTTPS source URL required")
    if not path.is_file():
        raise ValueError("GeoTIFF not found: " + str(path))
    try:
        import rasterio
    except ImportError as exc:
        raise ValueError("rasterio required; install in .venv") from exc
    with rasterio.open(path) as ds:
        if ds.driver != "GTiff" or not ds.crs or ds.count < 1:
            raise ValueError("file must be a georeferenced GeoTIFF")
        if ds.width <= 0 or ds.height <= 0:
            raise ValueError("empty raster")
        if ds.res[0] <= 0 or ds.res[1] <= 0:
            raise ValueError("invalid pixel resolution")
        info = {
            "driver": ds.driver, "crs": str(ds.crs), "width": ds.width,
            "height": ds.height, "bands": ds.count, "nodata": ds.nodata,
            "bounds": list(ds.bounds), "resolution": list(ds.res),
        }
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    manifest = {
        "provider": "esa-worldcereal", "status": "raster_verified_not_integrated",
        "field_id": field_id, "product": product, "year": year,
        "source_url": source_url, "local_path": str(path.resolve()),
        "sha256": digest.hexdigest(), "size_bytes": path.stat().st_size,
        "raster": info, "verified_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "notice": "Raster metadata verified; field clipping, class validation, DB persistence and license review remain separate steps.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(output), "status": manifest["status"],
                      "sha256": manifest["sha256"], "raster": info}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geotiff", type=Path)
    parser.add_argument("--field-id", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--product", choices=sorted(PRODUCTS), default="temporarycrops")
    parser.add_argument("--year", type=int, default=2021)
    parser.add_argument("--output", type=Path, default=Path(".local/datasets/reference/worldcereal/manifest.json"))
    args = parser.parse_args()
    try:
        verify(args.geotiff, args.field_id, args.source_url, args.product, args.year, args.output)
    except (ValueError, OSError) as exc:
        print("WorldCereal verification failed: " + str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
