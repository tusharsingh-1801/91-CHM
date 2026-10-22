import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import pytest
import reference_data as ref

SPEC=importlib.util.spec_from_file_location('acquire_features',Path(__file__).resolve().parents[2]/'scripts/acquire-cropharvest-features.py')
acquisition=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(acquisition)


def archive(tmp_path,name='features/arrays/1_source.h5',link=False):
    path=tmp_path/'archive.tar.gz'
    with tarfile.open(path,'w:gz') as stream:
        item=tarfile.TarInfo(name)
        if link:
            item.type=tarfile.SYMTYPE;item.linkname='/outside'
            stream.addfile(item)
        else:
            item.size=4;stream.addfile(item,io.BytesIO(b'data'))
    return tarfile.open(path,'r:gz')


def test_official_layout_is_flattened_without_trusting_paths(tmp_path):
    with archive(tmp_path) as stream:
        assert acquisition.members(stream)[0][1]=='1_source.h5'
    for name,link in [('../1_source.h5',False),('/1_source.h5',False),('1_source.h5',True)]:
        with archive(tmp_path,name,link) as stream,pytest.raises(ValueError):
            acquisition.members(stream)


def test_feature_receipt_requires_actual_unchanged_samples(tmp_path):
    assert ref.cropharvest_feature_summary(tmp_path)['feature_status']=='not_downloaded'
    folder=tmp_path/'features';folder.mkdir();sample=folder/'1_source.h5';sample.write_bytes(b'data')
    receipt={'record':'10251170','license':'CC BY-SA 4.0','sample_count':1,'samples':[{'id':'1_source','file':'features/1_source.h5','size_bytes':4,'sha256':hashlib.sha256(b'data').hexdigest()}]}
    (tmp_path/'feature-acquisition.json').write_text(json.dumps(receipt))
    result=ref.cropharvest_feature_summary(tmp_path)
    assert result['feature_sample_count']==1
    assert result['training_status']=='not_trained'
    sample.write_bytes(b'fake')
    with pytest.raises(ValueError,match='checksum'):
        ref.cropharvest_feature_summary(tmp_path)
