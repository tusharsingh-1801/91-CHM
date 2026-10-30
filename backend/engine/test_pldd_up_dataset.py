import importlib.util
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("prepare_pldd_up", ROOT / "scripts" / "prepare-pldd-up.py")
dataset = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(dataset)
TRAIN_SPEC = importlib.util.spec_from_file_location("train_pldd_up", ROOT / "scripts" / "train-pldd-up.py")
trainer = importlib.util.module_from_spec(TRAIN_SPEC)
TRAIN_SPEC.loader.exec_module(trainer)


def create_source(root: Path):
    class_counts = {"Healthy": 10, "EB": 10, "LB": 10}
    for class_index, (folder, count) in enumerate(class_counts.items()):
        class_root = root / folder
        class_root.mkdir(parents=True)
        for index in range(count):
            random = np.random.default_rng(class_index * 1000 + index)
            image = Image.fromarray(random.integers(0, 256, (48, 48, 3), dtype=np.uint8))
            image.save(class_root / f"leaf-{index:02}.jpg", quality=95)
    shutil.copyfile(root / "Healthy" / "leaf-00.jpg", root / "Healthy" / "leaf-09.jpg")
    manifest = {
        "image_count": sum(class_counts.values()),
        "classes": class_counts,
        "files": [],
    }
    return manifest, class_counts


def test_inventory_is_reproducible_and_keeps_exact_duplicates_together(tmp_path):
    source = tmp_path / "source"
    manifest, counts = create_source(source)
    manifest_path = tmp_path / "source-manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    report = dataset.build_inventory(source, manifest_path, tmp_path / "first", seed=17, expected_counts=counts)
    second = dataset.build_inventory(source, manifest_path, tmp_path / "second", seed=17, expected_counts=counts)

    assert report["validation"]["valid"] is True
    assert report["image_count"] == 30
    assert report["valid_image_count"] == 30
    inventory = json.loads((tmp_path / "first" / "inventory.json").read_text())
    assert len(inventory["exact_duplicate_groups"]) == 1
    first_manifest = json.loads((tmp_path / "first" / "training-manifest.json").read_text())
    second_manifest = json.loads((tmp_path / "second" / "training-manifest.json").read_text())
    assignments = {row["relative_path"]: row["split"] for row in first_manifest["images"]}
    assert assignments == {row["relative_path"]: row["split"] for row in second_manifest["images"]}
    duplicate_splits = {
        row["split"] for row in first_manifest["images"]
        if row["relative_path"] in ("Healthy/leaf-00.jpg", "Healthy/leaf-09.jpg")
    }
    assert len(duplicate_splits) == 1
    group_splits = {}
    for row in first_manifest["images"]:
        group_splits.setdefault(row["duplicate_group"], set()).add(row["split"])
    assert all(len(splits) == 1 for splits in group_splits.values())
    assert inventory["leakage_check"] == {"duplicate_group_cross_split_count": 0, "checked": True}
    assert set(inventory["split_counts"]) == {"train", "validation", "test"}


def test_inventory_reports_unreadable_images_without_assigning_splits(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    counts = {"Healthy": 1, "EB": 1, "LB": 1}
    for folder in counts:
        (source / folder).mkdir()
        (source / folder / "leaf.jpg").write_bytes(b"not an image")
    manifest_path = tmp_path / "source-manifest.json"
    manifest_path.write_text(json.dumps({"image_count": 3, "classes": counts}), encoding="utf-8")
    report = dataset.build_inventory(source, manifest_path, tmp_path / "output", expected_counts=counts)
    inventory = json.loads((tmp_path / "output" / "inventory.json").read_text())
    assert report["validation"]["valid"] is False
    assert inventory["valid_image_count"] == 0
    assert all("validation_error" in row for row in inventory["images"])


def test_training_loader_rejects_duplicate_groups_crossing_splits(tmp_path):
    manifest_path = tmp_path / "training-manifest.json"
    manifest_path.write_text(json.dumps({
        "dataset_id": "pldd-up-potato-leaf-disease",
        "classes": ["Healthy", "Early Blight", "Late Blight"],
        "source_manifest_sha256": "d" * 64,
        "validation": {"valid": True, "errors": []},
        "images": [
            {"relative_path": "Healthy/a.jpg", "label": "Healthy", "split": "train",
             "duplicate_group": "same-group", "sha256": "a" * 64},
            {"relative_path": "EB/b.jpg", "label": "Early Blight", "split": "test",
             "duplicate_group": "same-group", "sha256": "b" * 64},
            {"relative_path": "LB/c.jpg", "label": "Late Blight", "split": "validation",
             "duplicate_group": "other-group", "sha256": "c" * 64},
        ],
    }), encoding="utf-8")
    try:
        trainer.load_manifest(manifest_path)
    except ValueError as error:
        assert "crosses dataset splits" in str(error)
    else:
        raise AssertionError("Training accepted a duplicate group split across train and test")


def test_training_preprocessing_resizes_and_normalizes_rgb_images(tmp_path):
    image_path = tmp_path / "Healthy" / "leaf.jpg"
    image_path.parent.mkdir()
    Image.new("RGB", (36, 24), color=(60, 130, 75)).save(image_path, format="JPEG")
    loader = trainer.LeafDataset(
        [{"relative_path": "Healthy/leaf.jpg", "label": "Healthy"}],
        tmp_path, train=False,
    )
    tensor, label = loader[0]
    assert tuple(tensor.shape) == (3, 224, 224)
    assert label == 0


def test_training_source_hash_verification_rejects_changed_image(tmp_path):
    image_path = tmp_path / "Healthy" / "leaf.jpg"
    image_path.parent.mkdir()
    image_path.write_bytes(b"changed")
    with np.testing.assert_raises_regex(ValueError, "checksum changed"):
        trainer.verify_source_files(
            [{"relative_path": "Healthy/leaf.jpg", "sha256": "0" * 64}],
            tmp_path,
        )


def test_tiny_training_run_saves_heldout_metrics_and_model_artifacts(tmp_path):
    source = tmp_path / "source"
    samples = []
    rng = np.random.default_rng(42)
    class_to_folder = {"Healthy": "Healthy", "Early Blight": "EB", "Late Blight": "LB"}
    for split in ("train", "validation", "test"):
        for label_index, label in enumerate(trainer.CLASSES):
            folder = class_to_folder[label]
            image_path = source / folder / f"{split}-{label_index}.jpg"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            pixels = rng.integers(0, 256, (32, 32, 3), dtype=np.uint8)
            Image.fromarray(pixels).save(image_path, format="JPEG")
            relative_path = image_path.relative_to(source).as_posix()
            samples.append({
                "relative_path": relative_path,
                "filename": image_path.name,
                "source_class": folder,
                "label": label,
                "sha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
                "duplicate_group": f"group-{split}-{label_index}",
                "split": split,
                "width": 32,
                "height": 32,
                "format": "JPEG",
                "bytes": image_path.stat().st_size,
            })
    manifest_path = tmp_path / "training-manifest.json"
    manifest_path.write_text(json.dumps({
        "dataset_id": trainer.DATASET_ID,
        "seed": 42,
        "classes": trainer.CLASSES,
        "source_manifest_sha256": "d" * 64,
        "validation": {"valid": True, "errors": []},
        "images": samples,
    }), encoding="utf-8")
    output = tmp_path / "model-output"
    metadata = trainer.train(manifest_path, source, output, epochs=1, batch_size=3, seed=42)
    evaluation = json.loads((output / "evaluation.json").read_text())

    assert metadata["trained"] is True
    assert evaluation["test_samples"] == 3
    assert len(evaluation["confusion_matrix"]) == 3
    assert (output / "best-checkpoint.pth").is_file()
    assert (output / "model.pth").is_file()
    assert (output / "model-metadata.json").is_file()
    assert (output / "training-history.json").is_file()
    assert (output / "learning-curves.png").is_file()
