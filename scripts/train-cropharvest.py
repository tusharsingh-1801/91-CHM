#!/usr/bin/env python3
"""Offline crop/non-crop research baseline; requires licensed, checksummed real inputs.

No downloading, farm inference, accuracy defaults, or random per-row train/test split.
Manifest is kept with inputs under ignored .local/datasets/reference/cropharvest/.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse
import h5py
import numpy as np
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, f1_score, precision_score, recall_score

ROOT=Path(__file__).resolve().parents[1]/'.local/datasets/reference/cropharvest'
MAX_SAMPLE_BYTES=64*1024*1024
MAX_LABEL_BYTES=96*1024*1024

def checked_file(relative,checksum,max_bytes=MAX_SAMPLE_BYTES):
    path=(ROOT/relative).resolve()
    if not path.is_relative_to(ROOT.resolve()) or not path.is_file() or path.stat().st_size>max_bytes:
        raise ValueError('Input must be a bounded regular file inside CropHarvest cache')
    if hashlib.sha256(path.read_bytes()).hexdigest()!=checksum:
        raise ValueError(f'Checksum mismatch: {relative}')
    return path

def train(manifest):
    if not isinstance(manifest,dict) or manifest.get('record')!='10251170' or manifest.get('license')!='CC BY-SA 4.0':
        raise ValueError('Pinned official record and license required')
    if not isinstance(manifest.get('held_out_datasets'),list) or not manifest['held_out_datasets'] or any(not isinstance(x,str) or not x.strip() for x in manifest['held_out_datasets']) or len(set(manifest['held_out_datasets']))!=len(manifest['held_out_datasets']):
        raise ValueError('Choose unique held-out source datasets before training')
    if not isinstance(manifest.get('labels'),dict) or not isinstance(manifest.get('constituent_licenses'),dict) or not isinstance(manifest.get('samples'),list):
        raise ValueError('Manifest must include labels, constituent_licenses and samples')
    labels_path=checked_file(manifest['labels'].get('file',''),manifest['labels'].get('sha256',''),MAX_LABEL_BYTES)
    labels=json.loads(labels_path.read_text(encoding='utf-8'))['features']
    by_key={}
    for feature in labels:
        properties=feature['properties']
        key=f"{properties['index']}_{properties['dataset']}"
        if key in by_key:
            raise ValueError('Official labels contain duplicate sample IDs')
        by_key[key]=properties
    permitted=manifest['constituent_licenses']
    holdout=set(manifest['held_out_datasets'])
    samples=manifest['samples']
    if not 20<=len(samples)<=10000: raise ValueError('Require 20–10000 real feature samples')
    x,y,groups,ids,hashes=[],[],[],[],[]
    feature_shape=None
    for entry in samples:
        if not isinstance(entry,dict):
            raise ValueError('Each feature sample must be an object')
        key=entry.get('id')
        if not isinstance(key,str) or not re.fullmatch(r'[0-9]+_[A-Za-z0-9._-]+',key) or key not in by_key:
            raise ValueError('Feature sample ID must match a pinned CropHarvest label')
        label=by_key[key];dataset=label['dataset']
        if not isinstance(dataset,str) or not isinstance(label.get('is_test'),bool):
            raise ValueError('CropHarvest labels must include source dataset and official test designation')
        terms=permitted.get(dataset,{})
        source_url=terms.get('source_url','')
        host=urlparse(source_url).hostname or ''
        if not terms.get('license') or urlparse(source_url).scheme!='https' or not host:
            raise ValueError('Constituent source license and attribution required')
        if key in ids or entry.get('sha256') in hashes: raise ValueError('Duplicate feature sample')
        # Official test rows are reserved; this experiment evaluates held-out source datasets.
        if label.get('is_test') and dataset not in holdout:
            raise ValueError('Official test label cannot enter training')
        if label.get('is_crop') not in (True,False,0,1): raise ValueError('Missing crop label')
        if not isinstance(entry.get('file'),str) or not isinstance(entry.get('sha256'),str) or not re.fullmatch(r'[a-f0-9]{64}',entry['sha256']):
            raise ValueError('Feature input path and SHA-256 checksum are required')
        path=checked_file(entry['file'],entry['sha256'])
        if path.name!=f'{key}.h5':
            raise ValueError('Feature filename must match its official index_dataset label ID')
        with h5py.File(path,'r') as file:
            if 'array' not in file:
                raise ValueError(f'Feature sample {key} is missing its array')
            data=file['array']
            if data.ndim!=2 or data.size>10000: raise ValueError('Unexpected feature array dimensions')
            feature=np.asarray(data).ravel()
        if not np.issubdtype(feature.dtype,np.number): raise ValueError('Features must be numeric')
        if not np.isfinite(feature).all(): raise ValueError('Nonfinite features; no imputation')
        if feature_shape is None:
            feature_shape=feature.shape
        elif feature.shape!=feature_shape:
            raise ValueError('Feature sample dimensions differ; no implicit padding or truncation')
        x.append(feature);y.append(int(label['is_crop']));groups.append(dataset);ids.append(key);hashes.append(entry['sha256'])
    x,y=np.stack(x),np.array(y)
    test=np.array([group in holdout for group in groups])
    if sum(test)<10 or sum(~test)<10 or len(set(y[test]))!=2 or len(set(y[~test]))!=2:
        raise ValueError('Each partition requires both classes and at least ten samples')
    train_groups={groups[i] for i in np.flatnonzero(~test)}
    test_groups={groups[i] for i in np.flatnonzero(test)}
    if train_groups & test_groups:
        raise ValueError('Source dataset leakage between training and held-out evaluation')
    model=RandomForestClassifier(n_estimators=100,max_depth=12,class_weight='balanced',random_state=42,n_jobs=1)
    model.fit(x[~test],y[~test]);predicted=model.predict(x[test])
    return {'purpose':'Research held-out-source crop/non-crop baseline; not farm observations or deployment validation',
            'record':'10251170','seed':42,'sklearn':sklearn.__version__,'train_ids':[ids[i] for i in np.flatnonzero(~test)],'test_ids':[ids[i] for i in np.flatnonzero(test)],
            'held_out_datasets':sorted(holdout),'constituent_licenses':{name:permitted[name] for name in sorted(set(groups))},'labels_sha256':hashlib.sha256(labels_path.read_bytes()).hexdigest(),'test_sample_count':int(sum(test)),'train_sample_count':int(sum(~test)),
            'accuracy':float(accuracy_score(y[test],predicted)),
            'precision':float(precision_score(y[test],predicted,zero_division=0)),
            'recall':float(recall_score(y[test],predicted,zero_division=0)),
            'balanced_accuracy':float(balanced_accuracy_score(y[test],predicted)),
            'f1':float(f1_score(y[test],predicted,zero_division=0)),'confusion_matrix':confusion_matrix(y[test],predicted,labels=[0,1]).tolist(),
            'input_manifest_sha256':hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()}

if __name__=='__main__':
    try:
        manifest=json.loads((ROOT/'training-manifest.json').read_text())
        result=train(manifest)
        (ROOT/'held-out-evaluation.json').write_text(json.dumps(result,indent=2)+'\n')
        print('Saved actual held-out evaluation in .local/datasets/reference/cropharvest/held-out-evaluation.json')
    except (OSError,ValueError,KeyError) as exc:
        print(f'Unavailable: {exc}',file=sys.stderr)
        sys.exit(1)
