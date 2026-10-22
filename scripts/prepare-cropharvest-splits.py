#!/usr/bin/env python3
"""Inspect invalid CropHarvest labels and export safe split manifests.

Original official is_test=True records are held out; non-test records are
partitioned by source dataset. Outputs aggregate counts only.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path

def features(path):
    try:
        import ijson
    except ImportError:
        with path.open(encoding="utf-8") as handle:
            yield from json.load(handle)["features"]
    else:
        with path.open("rb") as handle:
            yield from ijson.items(handle, "features.item")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--labels", type=Path, default=Path(".local/datasets/reference/cropharvest/labels.geojson"))
    p.add_argument("--output", type=Path, default=Path(".local/datasets/reference/cropharvest/split-manifest.json"))
    args = p.parse_args()
    if not args.labels.is_file():
        p.error("labels file not found")
    counts = collections.Counter()
    invalid = []
    by_source = collections.defaultdict(lambda: collections.Counter())
    official_test = collections.Counter()
    total = 0
    for idx, feat in enumerate(features(args.labels)):
        total += 1
        props = feat.get("properties") or {}
        source, crop, flag = props.get("dataset"), props.get("is_crop"), props.get("is_test")
        geometry = feat.get("geometry")
        issues = []
        if not isinstance(source, str) or not source.strip():
            issues.append("missing_dataset")
        if type(crop) is not int or crop not in (0, 1):
            issues.append("invalid_is_crop")
        if type(flag) is not bool:
            issues.append("invalid_is_test")
        if not isinstance(geometry, dict) or not geometry.get("type") or not geometry.get("coordinates"):
            issues.append("missing_geometry")
        if issues:
            invalid.append({"feature_index": idx, "source": str(source), "issues": issues})
            continue
        official_test[str(crop)] += int(flag)
        if flag:
            split = "official_test"
        else:
            bucket = int(hashlib.sha256(("terrascope-source-v1:" + source).encode()).hexdigest()[:8], 16) % 10
            split = "validation" if bucket < 2 else "training"
        counts[(split, str(crop))] += 1
        by_source[source][split] += 1
    report = {
        "status": "label_split_prepared_no_model",
        "total_features": total,
        "valid_features": total - len(invalid),
        "invalid_features": invalid[:100],
        "split_counts": [{"split": split, "is_crop": int(crop), "count": n}
                         for (split, crop), n in sorted(counts.items())],
        "source_split_counts": {s: dict(c) for s, c in sorted(by_source.items())},
        "notes": [
            "Official test records are always held out.",
            "Other labels use deterministic source-level training/validation groups.",
            "This is an audit manifest, not extracted image features or a trained model.",
            "Check temporal and geographic leakage, label provenance and source licenses before model evaluation."
        ]
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"total": total, "valid": report["valid_features"],
                      "invalid": report["invalid_features"],
                      "splits": report["split_counts"],
                      "manifest": str(args.output)}, indent=2))
    return 0 if total else 1

if __name__ == "__main__":
    raise SystemExit(main())
