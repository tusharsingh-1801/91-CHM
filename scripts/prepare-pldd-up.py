#!/usr/bin/env python3
"""Build a read-only inventory and grouped training manifest for PLDD-UP."""

import argparse
import hashlib
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError
from sklearn.model_selection import StratifiedGroupKFold


ROOT = Path(__file__).resolve().parents[1]
DATASET_ID = "pldd-up-potato-leaf-disease"
CLASS_LABELS = {"Healthy": "Healthy", "EB": "Early Blight", "LB": "Late Blight"}
EXPECTED_COUNTS = {"Healthy": 4600, "EB": 4803, "LB": 6116}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SEED = 42
NEAR_DUPLICATE_HAMMING_DISTANCE = 3


class UnionFind:
    def __init__(self, size: int):
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> bool:
        left_root, right_root = self.find(left), self.find(right)
        if left_root == right_root:
            return False
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1
        return True


class BKTree:
    def __init__(self):
        self.root: tuple[int, dict[int, Any]] | None = None

    @staticmethod
    def distance(left: int, right: int) -> int:
        return (left ^ right).bit_count()

    def add(self, value: int, image_index: int):
        if self.root is None:
            self.root = (value, { -1: [image_index] })
            return
        node = self.root
        while True:
            current, children = node
            distance = self.distance(value, current)
            if distance == 0:
                children[-1].append(image_index)
                return
            child = children.get(distance)
            if child is None:
                children[distance] = (value, { -1: [image_index] })
                return
            node = child

    def within(self, value: int, radius: int):
        if self.root is None:
            return
        stack = [self.root]
        while stack:
            current, children = stack.pop()
            distance = self.distance(value, current)
            if distance <= radius:
                yield from children[-1]
            low, high = distance - radius, distance + radius
            stack.extend(child for edge, child in children.items() if edge >= 0 and low <= edge <= high)


def dhash(path: Path) -> int:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
        pixels = list(image.getdata())
    value = 0
    for row in range(8):
        for column in range(8):
            value = (value << 1) | int(pixels[row * 9 + column] > pixels[row * 9 + column + 1])
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def grouped_splits(records: list[dict[str, Any]], seed: int) -> dict[str, str]:
    groups = sorted({record["duplicate_group"] for record in records})
    if len(groups) < 3:
        raise ValueError("At least three independent duplicate groups are required to create splits")
    per_class_count = Counter(record["label"] for record in records)
    if min(per_class_count.values()) < 3:
        raise ValueError("Each class needs at least three independent examples for train, validation, and test")
    group_count = min(20, len(groups), min(per_class_count.values()))
    labels = [record["label"] for record in records]
    group_ids = [record["duplicate_group"] for record in records]
    splitter = StratifiedGroupKFold(n_splits=group_count, shuffle=True, random_state=seed)
    folds = [test_indices for _, test_indices in splitter.split(records, labels, group_ids)]
    fold_order = list(range(group_count))
    random.Random(seed).shuffle(fold_order)
    heldout_count = max(1, round(group_count * 0.15))
    test_folds = set(fold_order[:heldout_count])
    validation_folds = set(fold_order[heldout_count:heldout_count * 2])
    if not validation_folds:
        validation_folds = {fold_order[-1]}
        test_folds.discard(fold_order[-1])

    result: dict[str, str] = {}
    for fold_number, indices in enumerate(folds):
        split = "test" if fold_number in test_folds else "validation" if fold_number in validation_folds else "train"
        for index in indices:
            result[records[index]["relative_path"]] = split

    split_labels = {
        split: {record["label"] for record in records if result[record["relative_path"]] == split}
        for split in ("train", "validation", "test")
    }
    if any(not values for values in split_labels.values()):
        raise ValueError("Grouped split produced an empty partition; provide more independent images")
    missing = {split: sorted(set(CLASS_LABELS.values()) - values) for split, values in split_labels.items()}
    if any(missing.values()):
        raise ValueError(f"Every split must contain all three classes; missing labels: {missing}")
    return result


def build_inventory(
    source: Path,
    source_manifest: Path,
    output: Path,
    seed: int = SEED,
    expected_counts: dict[str, int] = EXPECTED_COUNTS,
    progress_every: int = 0,
) -> dict[str, Any]:
    source = source.resolve()
    source_manifest = source_manifest.resolve()
    output = output.resolve()
    if source == output or source in output.parents:
        raise ValueError("Inventory outputs must be outside the extracted source tree")
    generated_names = ("inventory.json", "training-manifest.json", "validation-report.json")
    if any((output / name).exists() for name in generated_names):
        raise FileExistsError("Processed output already exists; choose a fresh --output directory")
    try:
        source_manifest_label = source_manifest.relative_to(ROOT).as_posix()
    except ValueError:
        source_manifest_label = source_manifest.name
    manifest = json.loads(source_manifest.read_text(encoding="utf-8-sig"))
    errors: list[str] = []
    observed_classes = {path.name for path in source.iterdir() if path.is_dir()}
    if observed_classes != set(CLASS_LABELS):
        errors.append(f"Expected class folders {sorted(CLASS_LABELS)}, found {sorted(observed_classes)}")

    records: list[dict[str, Any]] = []
    format_counts: Counter[str] = Counter()
    dimension_counts: Counter[str] = Counter()
    hashes: dict[str, list[int]] = defaultdict(list)
    perceptual_hashes: list[int] = []
    image_indices: list[int] = []
    image_counts: Counter[str] = Counter()

    all_paths = {
        folder: sorted(path for path in (source / folder).rglob("*")
                       if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS)
        for folder in sorted(CLASS_LABELS) if (source / folder).is_dir()
    }
    total_paths = sum(len(paths) for paths in all_paths.values())
    checked_paths = 0
    for folder in sorted(CLASS_LABELS):
        class_root = source / folder
        if not class_root.is_dir():
            continue
        paths = all_paths[folder]
        for path in paths:
            relative = path.relative_to(source).as_posix()
            record: dict[str, Any] = {
                "relative_path": relative,
                "filename": path.name,
                "source_class": folder,
                "label": CLASS_LABELS[folder],
                "bytes": path.stat().st_size,
            }
            try:
                record["sha256"] = sha256_file(path)
                with Image.open(path) as image:
                    image.verify()
                with Image.open(path) as image:
                    image.load()
                    width, height = image.size
                    image_format = image.format
                if width < 1 or height < 1:
                    raise ValueError("Image dimensions are empty")
                record.update({"width": width, "height": height, "format": image_format})
                record["dhash64"] = f"{dhash(path):016x}"
                image_index = len(records)
                hashes[record["sha256"]].append(image_index)
                perceptual_hashes.append(int(record["dhash64"], 16))
                image_indices.append(image_index)
                format_counts[image_format or "UNKNOWN"] += 1
                dimension_counts[f"{width}x{height}"] += 1
                image_counts[folder] += 1
            except (OSError, ValueError, UnidentifiedImageError, Image.DecompressionBombError) as error:
                errors.append(f"{relative}: {type(error).__name__}: {error}")
                record["validation_error"] = type(error).__name__
            records.append(record)
            checked_paths += 1
            if progress_every and checked_paths % progress_every == 0:
                print(f"Validated {checked_paths}/{total_paths} images.", file=sys.stderr, flush=True)

    if progress_every:
        print(f"Image decode and checksum pass complete: {checked_paths}/{total_paths}.", file=sys.stderr, flush=True)

    for class_name, expected_count in expected_counts.items():
        actual = image_counts[class_name]
        if actual != expected_count:
            errors.append(f"{class_name} image count expected {expected_count}, found {actual}")
        manifest_count = manifest.get("classes", {}).get(class_name)
        if manifest_count != expected_count:
            errors.append(f"Source manifest class count for {class_name} does not match expected count")

    expected_total = sum(expected_counts.values())
    if len(records) != expected_total:
        errors.append(f"Total image count expected {expected_total}, found {len(records)}")
    if manifest.get("image_count") != expected_total:
        errors.append("Source manifest image_count does not match expected total")

    duplicate_groups = [indices for indices in hashes.values() if len(indices) > 1]
    union_find = UnionFind(len(records))
    for indices in duplicate_groups:
        for index in indices[1:]:
            union_find.union(indices[0], index)

    tree = BKTree()
    for hash_index, value in enumerate(perceptual_hashes):
        index = image_indices[hash_index]
        for previous in tree.within(value, NEAR_DUPLICATE_HAMMING_DISTANCE):
            union_find.union(index, previous)
        tree.add(value, index)
        if progress_every and (hash_index + 1) % progress_every == 0:
            print(f"Compared perceptual hashes for {hash_index + 1}/{len(perceptual_hashes)} images.",
                  file=sys.stderr, flush=True)

    component_members: dict[int, list[int]] = defaultdict(list)
    for index, record in enumerate(records):
        if "sha256" in record:
            component_members[union_find.find(index)].append(index)
    duplicate_components = [members for members in component_members.values() if len(members) > 1]
    near_components = [
        members for members in duplicate_components
        if len({records[index]["sha256"] for index in members}) > 1
    ]
    for group_number, members in enumerate(sorted(duplicate_components, key=lambda group: min(group)), start=1):
        group_id = f"dup-{group_number:06d}"
        for index in members:
            records[index]["duplicate_group"] = group_id
    for record in records:
        record.setdefault("duplicate_group", f"unique-{record['sha256'][:16]}" if "sha256" in record else f"invalid-{record['relative_path']}")

    members_by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        members_by_group[record["duplicate_group"]].append(record)
    class_conflicts = []
    for group_id, members in sorted(members_by_group.items()):
        labels = sorted({record["label"] for record in members if "sha256" in record})
        if len(labels) > 1:
            class_conflicts.append({"group_id": group_id, "labels": labels,
                                    "files": [record["relative_path"] for record in members]})

    valid_records = [record for record in records if "format" in record]
    assignments: dict[str, str] = {}
    if not errors:
        try:
            assignments = grouped_splits(valid_records, seed)
            for record in records:
                if record["relative_path"] in assignments:
                    record["split"] = assignments[record["relative_path"]]
        except ValueError as error:
            errors.append(f"Could not create leakage-safe splits: {error}")

    split_counts = {
        split: dict(Counter(record["label"] for record in records if record.get("split") == split))
        for split in ("train", "validation", "test")
    }
    group_splits: dict[str, set[str]] = defaultdict(set)
    for record in records:
        if record.get("split"):
            group_splits[record["duplicate_group"]].add(record["split"])
    cross_split_groups = sum(len(splits) > 1 for splits in group_splits.values())
    if cross_split_groups:
        errors.append(f"{cross_split_groups} duplicate groups cross dataset splits")
    inventory = {
        "dataset_id": DATASET_ID,
        "source_manifest": {
            "path": source_manifest_label,
            "sha256": sha256_file(source_manifest),
        },
        "source_root": str(source),
        "seed": seed,
        "image_count": len(records),
        "valid_image_count": len(valid_records),
        "class_counts": dict(sorted(image_counts.items())),
        "image_formats": dict(sorted(format_counts.items())),
        "dimensions": dict(sorted(dimension_counts.items())),
        "exact_duplicate_groups": [
            [records[index]["relative_path"] for index in members]
            for members in sorted(duplicate_groups, key=lambda group: min(group))
        ],
        "near_duplicate_candidates": [
            {
                "group_id": records[members[0]]["duplicate_group"],
                "files": [records[index]["relative_path"] for index in members],
            }
            for members in sorted(near_components, key=lambda group: min(group))
        ],
        "near_duplicate_method": {
            "algorithm": "64-bit difference hash",
            "maximum_hamming_distance": NEAR_DUPLICATE_HAMMING_DISTANCE,
            "interpretation": "Candidate groups only; visually similar images are not confirmed duplicates.",
        },
        "cross_class_duplicate_groups": class_conflicts,
        "split_counts": split_counts,
        "leakage_check": {
            "duplicate_group_cross_split_count": cross_split_groups,
            "checked": bool(assignments),
        },
        "validation": {"valid": not errors, "errors": errors},
        "images": records,
    }
    output.mkdir(parents=True, exist_ok=True)
    training_manifest = {
        "dataset_id": DATASET_ID,
        "seed": seed,
        "source_manifest_sha256": inventory["source_manifest"]["sha256"],
        "validation": {"valid": not errors, "errors": errors},
        "classes": list(CLASS_LABELS.values()),
        "class_counts": dict(sorted(image_counts.items())),
        "split_counts": split_counts,
        "inventory_path": "inventory.json",
        "images": [
            {key: record[key] for key in (
                "relative_path", "filename", "source_class", "label", "sha256",
                "duplicate_group", "split", "width", "height", "format", "bytes"
            ) if key in record}
            for record in records
        ],
    }
    report = {
        "dataset_id": DATASET_ID,
        "validation": inventory["validation"],
        "image_count": inventory["image_count"],
        "valid_image_count": inventory["valid_image_count"],
        "class_counts": inventory["class_counts"],
        "image_formats": inventory["image_formats"],
        "dimension_count": len(dimension_counts),
        "exact_duplicate_group_count": len(duplicate_groups),
        "near_duplicate_candidate_group_count": len(near_components),
        "cross_class_duplicate_group_count": len(class_conflicts),
        "split_counts": split_counts,
        "leakage_check": inventory["leakage_check"],
    }
    (output / "inventory.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    (output / "training-manifest.json").write_text(json.dumps(training_manifest, indent=2) + "\n", encoding="utf-8")
    (output / "validation-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / ".local/datasets/up/pldd-up/extracted")
    parser.add_argument("--manifest", type=Path, default=ROOT / ".local/datasets/up/pldd-up/manifest.json")
    parser.add_argument("--output", type=Path, default=ROOT / ".local/datasets/up/pldd-up/processed")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--progress-every", type=int, default=500,
                        help="Print scan progress every N images; set 0 to suppress")
    args = parser.parse_args()
    try:
        report = build_inventory(args.source, args.manifest, args.output, args.seed,
                                 progress_every=args.progress_every)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(json.dumps({"valid": False, "error": str(error)}, indent=2), file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2))
    return 0 if report["validation"]["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
