#!/usr/bin/env python3
import argparse
import hashlib
import json
import shutil
from pathlib import Path

import rasterio

ROOT = Path(".local/datasets/reference/worldcereal")

parser = argparse.ArgumentParser()
parser.add_argument("raster", type=Path)
parser.add_argument("--source-url", required=True)
args = parser.parse_args()

if not args.raster.is_file():
    parser.error("Official WorldCereal GeoTIFF file missing")

if not args.source_url.startswith((
    "https://hub.esa-worldcereal.org/",
    "https://zenodo.org/"
)):
    parser.error("Official WorldCereal source URL required")

with rasterio.open(args.raster) as ds:
    if ds.driver != "GTiff" or ds.crs is None:
        parser.error("Valid georeferenced GeoTIFF required")
    print("CRS:", ds.crs)
    print("Bounds:", ds.bounds)
    print("Resolution:", ds.res)

ROOT.mkdir(parents=True, exist_ok=True)

destination = ROOT / "temporarycrops-2021.tif"

if args.raster.resolve() != destination.resolve():
    if destination.exists():
        parser.error("Destination already exists; refusing overwrite")
    shutil.copy2(args.raster, destination)

digest = hashlib.sha256(destination.read_bytes()).hexdigest()

manifest = {
    "product": "temporarycrops",
    "version": "2021 v100",
    "license": "CC BY 4.0",
    "rasters": [{
        "file": destination.name,
        "source_url": args.source_url,
        "sha256": digest
    }]
}

output = ROOT / "manifest.json"
if output.exists():
    parser.error("Manifest already exists; refusing overwrite")

output.write_text(json.dumps(manifest, indent=2) + "\n")

print("WorldCereal manifest created:", output)
