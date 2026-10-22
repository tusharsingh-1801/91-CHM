#!/usr/bin/env python3
"""Audit CropHarvest labels and create reproducible leakage-aware label partitions.

Does not train a model or claim measured accuracy. Streams the 80+ MB GeoJSON
with ijson when available, otherwise loads the file using the standard library.
Output is local and contains counts, not redistributed individual labels.
"""
import argparse
import collections
import hashlib
import json
import sys
from pathlib import Path

def features(path):
    try:
        import ijson
    except ImportError:
        with path.open(encoding="utf-8") as stream:
            for feature in json.load(stream)["features"]:
                yield feature
    else:
        with path.open("rb") as stream:
            yield from ijson.items(stream, "features.item")

def audit(path, output):
    if not path.is_file():
        raise ValueError("labels.geojson not found")
    source_counts = collections.Counter()
    class_counts = collections.Counter()
    source_class = collections.Counter()
    test_counts = collections.Counter()
    invalid = 0
    count = 0
    for feature in features(path):
        count += 1
        props = feature.get("properties") or {}
        source = props.get("dataset")
        crop = props.get("is_crop")
        is_test = props.get("is_test")
        geometry = feature.get("geometry")
        if not isinstance(source, str) or not source or crop not in (0, 1) or not isinstance(geometry, dict):
            invalid += 1
            continue
        source_counts[source] += 1
        class_counts[str(crop)] += 1
        source_class[(source, str(crop))] += 1
        test_counts[str(is_test)] += 1
    # Deterministic dataset-level partition, not random label-level split.
    # Preserve official is_test flags in the report; never relabel them.
    sources = sorted(source_counts)
    partitions = {}
    for source in sources:
        bucket = int(hashlib.sha256(("terrascope-cropharvest-v1:" + source).encode()).hexdigest()[:8], 16) % 10
        partitions[source] = "validation" if bucket < 2 else "training"
    result = {
        "provider": "NASA Harvest CropHarvest",
        "status": "labels_audited_no_model",
        "source_file": str(path),
        "total_features": count,
        "invalid_features": invalid,
        "source_counts": dict(sorted(source_counts.items())),
        "crop_counts": dict(class_counts),
        "official_is_test_counts": dict(test_counts),
        "source_class_counts": [
            {"dataset": name, "is_crop": crop, "count": n}
            for (name, crop), n in sorted(source_class.items())
        ],
        "proposed_source_group_split": partitions,
        "caveats": [
            "Dataset-level split is only a proposal; review source, location, dates and official test flags before evaluation.",
            "No satellite time-series features have been joined to labels.",
            "No training, prediction or accuracy metrics have been performed.",
            "Source license and constituent dataset restrictions must be reviewed before redistribution."
        ]
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"], "total_features": count,
        "invalid_features": invalid, "datasets": len(sources),
        "class_counts": dict(class_counts), "output": str(output)
    }, indent=2))
    return 0 if invalid == 0 and count > 0 else 1

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--labels", type=Path, default=Path(".local/datasets/reference/cropharvest/labels.geojson"))
    parser.add_argument("--output", type=Path, default=Path(".local/datasets/reference/cropharvest/label-audit.json"))
    args = parser.parse_args()
    try:
        return audit(args.labels, args.output)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as exc:
        print("CropHarvest audit failed: " + str(exc), file=sys.stderr)
        return 2

if __name__ == "__main__":
    sys.exit(main())
