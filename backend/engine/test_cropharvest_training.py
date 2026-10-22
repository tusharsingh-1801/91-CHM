import hashlib
import importlib.util
import json
from pathlib import Path

import h5py
import numpy as np
import pytest


MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'train-cropharvest.py'
SPEC = importlib.util.spec_from_file_location('train_cropharvest', MODULE_PATH)
trainer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(trainer)


def training_fixture(tmp_path):
    trainer.ROOT = tmp_path
    rows = []
    samples = []
    licenses = {}
    groups = {'Train-A': False, 'Train-B': False, 'Test-A': True, 'Test-B': True}
    for group_index, (dataset, is_test) in enumerate(groups.items()):
        licenses[dataset] = {'license': 'CC BY 4.0', 'source_url': f'https://example.org/{dataset}'}
        for index in range(5):
            is_crop = index % 2 == 1
            sample_id = f'{index}_{dataset}'
            rows.append({'type': 'Feature', 'properties': {
                'index': index, 'dataset': dataset, 'is_crop': is_crop, 'is_test': is_test,
            }})
            feature_path = tmp_path / f'{sample_id}.h5'
            with h5py.File(feature_path, 'w') as sample:
                sample.create_dataset('array', data=np.full((2, 2), group_index * 100 + index * 3 + int(is_crop), dtype=np.float32))
            samples.append({
                'id': sample_id, 'file': feature_path.name,
                'sha256': hashlib.sha256(feature_path.read_bytes()).hexdigest(),
            })
    label_path = tmp_path / 'labels.geojson'
    label_path.write_text(json.dumps({'features': rows}))
    manifest = {
        'record': '10251170', 'license': 'CC BY-SA 4.0',
        'labels': {'file': 'labels.geojson', 'sha256': hashlib.sha256(label_path.read_bytes()).hexdigest()},
        'constituent_licenses': licenses, 'held_out_datasets': ['Test-A', 'Test-B'],
        'samples': samples,
    }
    return manifest


def test_training_uses_grouped_real_held_out_evaluation(tmp_path):
    result = trainer.train(training_fixture(tmp_path))
    assert len(result['train_ids']) == 10
    assert len(result['test_ids']) == 10
    assert set(result['held_out_datasets']) == {'Test-A', 'Test-B'}
    assert result['balanced_accuracy'] >= 0
    assert result['f1'] >= 0
    assert len(result['input_manifest_sha256']) == 64


def test_training_rejects_feature_dataset_leakage(tmp_path):
    manifest = training_fixture(tmp_path)
    manifest['held_out_datasets'] = ['Test-A', 'Test-B', 'Train-A']
    with pytest.raises(ValueError, match='Each partition requires both classes'):
        trainer.train(manifest)


def test_training_rejects_feature_from_another_label(tmp_path):
    manifest = training_fixture(tmp_path)
    manifest['samples'][0]['file'] = manifest['samples'][1]['file']
    manifest['samples'][0]['sha256'] = manifest['samples'][1]['sha256']
    with pytest.raises(ValueError, match='Feature filename must match'):
        trainer.train(manifest)


def test_training_requires_constituent_source_terms(tmp_path):
    manifest = training_fixture(tmp_path)
    del manifest['constituent_licenses']['Train-A']['license']
    with pytest.raises(ValueError, match='Constituent source license'):
        trainer.train(manifest)
