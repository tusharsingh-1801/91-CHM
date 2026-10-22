#!/usr/bin/env python3
"""Fetch public TerraScope reference datasets without fabricating field observations."""
import argparse
import json
import os
import pathlib
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(".local/datasets/reference")
USER_AGENT = "TerraScope/1.0 (academic geospatial research)"
SOURCES = {
    "soilgrids": "https://rest.isric.org/soilgrids/v2.0/properties/query",
    "worldcover": "https://esa-worldcover.s3.eu-central-1.amazonaws.com/esa_worldcover_2021_grid.geojson",
    "chirps": "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/",
    "cropharvest": "https://github.com/nasaharvest/cropharvest",
    "worldcereal": "https://esa-worldcereal.org/en/products/global-maps",
    "fao-calendar": "https://cropcalendar.apps.fao.org/",
}

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=35) as response:
        return json.load(response)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=[*SOURCES, "all"], default="all")
    parser.add_argument("--lat", type=float, help="Actual farm latitude")
    parser.add_argument("--lon", type=float, help="Actual farm longitude")
    args = parser.parse_args()
    if (args.lat is None) != (args.lon is None):
        parser.error("Provide both --lat and --lon")
    if args.lat is not None and not (-90 <= args.lat <= 90 and -180 <= args.lon <= 180):
        parser.error("Invalid coordinates")
    ROOT.mkdir(parents=True, exist_ok=True)
    selected = list(SOURCES) if args.source == "all" else [args.source]
    results = []
    for name in selected:
        entry = {"source": name, "url": SOURCES[name], "timestamp": datetime.now(timezone.utc).isoformat()}
        try:
            if name == "soilgrids" and args.lat is not None:
                params = urllib.parse.urlencode([
                    ("lat", str(args.lat)), ("lon", str(args.lon)),
                    *[("property", p) for p in ("phh2o", "soc", "nitrogen", "sand", "silt", "clay")],
                    ("depth", "0-5cm"), ("value", "mean")
                ])
                data = get_json(SOURCES[name] + "?" + params)
                output = ROOT / "soilgrids-point.json"
                output.write_text(json.dumps({"coordinates": {"lat": args.lat, "lon": args.lon}, "source": SOURCES[name], "data": data}, indent=2))
                entry.update(status="downloaded", file=str(output))
            elif name == "worldcover":
                data = get_json(SOURCES[name])
                output = ROOT / "worldcover-grid.geojson"
                output.write_text(json.dumps(data))
                entry.update(status="downloaded_index_only", file=str(output), note="Tile index only; actual raster tiles not downloaded")
            else:
                entry.update(status="manual_or_specialized_access_required", note="Catalogued but not imported; requires dataset-specific access, licensing, or geospatial subset workflow" if name != "soilgrids" else "Provide --lat and --lon for a point query")
        except (urllib.error.URLError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as exc:
            entry.update(status="fetch_failed", error=str(exc))
        results.append(entry)
        print(f"{name}: {entry['status']}")
    report = ROOT / "fetch-report.json"
    report.write_text(json.dumps({"results": results}, indent=2) + "\n")
    print(f"Report: {report}")
    if any(item["status"] == "fetch_failed" for item in results):
        raise SystemExit(1)

if __name__ == "__main__":
    main()
