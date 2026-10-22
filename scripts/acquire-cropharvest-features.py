#!/usr/bin/env python3
"""Acquire the pinned official processed features; never download the raw EO archive."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile
import tempfile
import datetime as dt
import requests

RECORD = '10251170'
ROOT = Path(__file__).resolve().parents[1] / '.local/datasets/reference/cropharvest'
MAX_ARCHIVE = 128 * 1024 * 1024
MAX_UNPACKED = 1024 * 1024 * 1024
MAX_SAMPLE = 64 * 1024 * 1024
MAX_FILES = 150000


def members(archive):
    """Validate the entire archive before writing a single sample."""
    result, seen, total = [], set(), 0
    for member in archive:
        parts = PurePosixPath(member.name).parts
        if not parts or member.name.startswith('/') or '..' in parts or '\\' in member.name or member.issym() or member.islnk():
            raise ValueError('Unsafe archive member')
        if member.isdir():
            continue
        if not member.isfile():
            raise ValueError('Unsupported archive member')
        name = parts[-1]
        if not re.fullmatch(r'[0-9]+_[A-Za-z0-9._-]+\.h5', name):
            # The official archive can include normalization metadata, retained only in the archive.
            if name == 'normalizing_dict.h5':
                continue
            raise ValueError('Unexpected feature filename: ' + member.name)
        if name in seen or member.size <= 0 or member.size > MAX_SAMPLE:
            raise ValueError('Duplicate or oversized feature')
        total += member.size
        if total > MAX_UNPACKED or len(result) >= MAX_FILES:
            raise ValueError('Feature archive exceeds extraction bounds')
        seen.add(name)
        result.append((member, name))
    if not result:
        raise ValueError('No feature samples in archive')
    return result


def acquire():
    ROOT.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    metadata_response = session.get(f'https://zenodo.org/api/records/{RECORD}', timeout=60)
    metadata_response.raise_for_status()
    metadata = metadata_response.json()
    if metadata.get('metadata', {}).get('license', {}).get('id') != 'cc-by-sa-4.0':
        raise ValueError('Pinned record license changed')
    item = next(f for f in metadata['files'] if f['key'] == 'features.tar.gz')
    if not 0 < item['size'] <= MAX_ARCHIVE or not re.fullmatch(r'md5:[a-f0-9]{32}', item['checksum']):
        raise ValueError('Unexpected official archive size or checksum')
    url = f'https://zenodo.org/records/{RECORD}/files/features.tar.gz?download=1'
    archive_path = ROOT / 'features.tar.gz'
    def verified(path):
        digest = hashlib.md5()
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        return path.stat().st_size == item['size'] and 'md5:' + digest.hexdigest() == item['checksum']
    if archive_path.exists():
        if not verified(archive_path):
            raise ValueError('Existing archive differs; refusing overwrite')
    else:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=ROOT, suffix='.partial', delete=False) as output:
                temporary = Path(output.name)
                with session.get(url, stream=True, timeout=(30, 120)) as response:
                    response.raise_for_status()
                    size = 0
                    for chunk in response.iter_content(1024 * 1024):
                        size += len(chunk)
                        if size > item['size'] or size > MAX_ARCHIVE:
                            raise ValueError('Download exceeds official size')
                        output.write(chunk)
            if not verified(temporary):
                raise ValueError('Official archive checksum mismatch')
            os.replace(temporary, archive_path)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()
    destination = ROOT / 'features'
    destination.mkdir(exist_ok=True)
    inventory = []
    with tarfile.open(archive_path, 'r:gz') as archive:
        selected = members(archive)
        for member, name in selected:
            content = archive.extractfile(member).read(MAX_SAMPLE + 1)
            if len(content) != member.size:
                raise ValueError('Truncated feature')
            checksum = hashlib.sha256(content).hexdigest()
            target = destination / name
            if target.is_symlink():
                raise ValueError('Refusing symlink sample: ' + name)
            if target.exists():
                if hashlib.sha256(target.read_bytes()).hexdigest() != checksum:
                    raise ValueError('Existing sample differs; refusing overwrite: ' + name)
            else:
                with tempfile.NamedTemporaryFile(dir=destination, delete=False) as output:
                    output.write(content)
                    temporary = Path(output.name)
                os.replace(temporary, target)
            inventory.append({'id': name[:-3], 'file': 'features/' + name, 'sha256': checksum, 'size_bytes': len(content)})
    report = {'record': RECORD, 'source_url': url, 'license': 'CC BY-SA 4.0', 'provider_checksum': item['checksum'],
              'archive_sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(), 'archive_bytes': item['size'],
              'acquired_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'features_acquired_not_trained',
              'sample_count': len(inventory), 'samples': inventory,
              'notice': 'Official processed research features. Constituent source attribution and held-out evaluation remain required. Not field measurements or a deployed model.'}
    receipt = ROOT / 'feature-acquisition.json'
    receipt.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'samples'}, indent=2))


if __name__ == '__main__':
    try:
        acquire()
    except (OSError, ValueError, requests.RequestException, tarfile.TarError, KeyError, StopIteration) as error:
        raise SystemExit('CropHarvest acquisition failed: ' + str(error))
