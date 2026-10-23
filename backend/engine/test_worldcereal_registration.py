import importlib.util
import json
from pathlib import Path
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

SPEC=importlib.util.spec_from_file_location('register_aoi',Path(__file__).resolve().parents[2]/'scripts/register-worldcereal-aoi.py')
register=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(register)

def raster(path,values):
 with rasterio.open(path,'w',driver='GTiff',width=2,height=2,count=1,dtype='uint8',crs='EPSG:4326',transform=from_origin(77,18,.0001,.0001),nodata=255) as f:f.write(np.array(values,dtype='uint8'),1)

def test_registration_appends_and_never_replaces_previous_rasters(tmp_path):
 a=tmp_path/'a.tif';b=tmp_path/'b.tif';root=tmp_path/'cache'
 raster(a,[[0,100],[100,0]]);raster(b,[[100,100],[100,0]])
 url='https://zenodo.org/records/7875105/files/official.zip'
 register.register(a,url,root);before=(root/'manifest.json').read_bytes()
 assert register.register(a,url,root)['status']=='already_registered'
 assert (root/'manifest.json').read_bytes()==before
 register.register(b,url,root)
 manifest=json.loads((root/'manifest.json').read_text());assert len(manifest['rasters'])==2
 assert len(list(root.glob('*.tif')))==2

def test_registration_rejects_unofficial_sources_and_wrong_classes(tmp_path):
 a=tmp_path/'a.tif';raster(a,[[20,100],[100,0]])
 with pytest.raises(ValueError,match='Official'):register.register(a,'https://example.invalid/export',tmp_path/'cache')
 with pytest.raises(ValueError,match='classification codes'):register.register(a,'https://zenodo.org/records/7875105',tmp_path/'cache')

def test_identical_aoi_can_link_fields_without_overlapping_duplicate_files(tmp_path):
 a=tmp_path/'a.tif';root=tmp_path/'cache';raster(a,[[0,100],[100,0]])
 url='https://zenodo.org/records/7875105/files/official.zip'
 register.register(a,url,root,field_id='field-a')
 register.register(a,url,root,field_id='field-b')
 manifest=json.loads((root/'manifest.json').read_text())
 assert len(manifest['rasters'])==1
 assert manifest['rasters'][0]['field_ids']==['field-a','field-b']

def test_field_scoped_rasters_are_not_used_for_another_field(monkeypatch,tmp_path):
 import reference_data as ref
 from shapely.geometry import box,mapping
 a=tmp_path/'a.tif';root=tmp_path/'worldcereal';raster(a,[[0,100],[100,0]])
 register.register(a,'https://zenodo.org/records/7875105/files/official.zip',root,field_id='field-a')
 monkeypatch.setattr(ref,'CACHE',tmp_path)
 result=ref.worldcereal({'id':'field-b','geometry':mapping(box(77.00001,17.99981,77.00019,17.99999))},{})
 assert result['status']=='not_configured'
 assert result['availability']=='aoi_export_required'

def test_field_export_supersedes_overlapping_legacy_raster(monkeypatch,tmp_path):
 import reference_data as ref
 from shapely.geometry import box,mapping
 root=tmp_path/'worldcereal';a=tmp_path/'a.tif';b=tmp_path/'b.tif'
 raster(a,[[0,0],[0,0]]);raster(b,[[100,100],[100,100]])
 url='https://zenodo.org/records/7875105/files/official.zip'
 register.register(a,url,root)
 register.register(b,url,root,field_id='field-a')
 monkeypatch.setattr(ref,'CACHE',tmp_path)
 result=ref.worldcereal({'id':'field-a','geometry':mapping(box(77.00001,17.99981,77.00019,17.99999))},{})
 assert [row['code'] for row in result['classes']]==[100]
 assert len(result['raster_provenance'])==1
 assert len(list(root.glob('*.tif')))==2
