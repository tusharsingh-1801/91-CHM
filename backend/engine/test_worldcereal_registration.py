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
