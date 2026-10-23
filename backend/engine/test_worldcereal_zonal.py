import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box,Polygon
import reference_data as ref
from worldcereal_zonal import aggregate

def raster(tmp_path):
 path=tmp_path/'map.tif'
 with rasterio.open(path,'w',driver='GTiff',width=4,height=4,count=1,dtype='uint8',crs='EPSG:4326',transform=from_origin(77,26.004,.001,.001),nodata=255) as output:
  output.write(np.array([[0,100,100,0],[100,255,0,100],[0,100,0,100],[100,100,0,0]],dtype='uint8'),1)
 return path

@pytest.mark.parametrize('geometry',[
 box(77.0004,26.0004,77.0036,26.0036),
 Polygon([(77.0002,26.0002),(77.0038,26.0002),(77.0025,26.0038),(77.0002,26.0002)]),
 Polygon(box(77.0001,26.0001,77.0039,26.0039).exterior.coords,[box(77.0012,26.0012,77.0018,26.0018).exterior.coords]),
])
def test_row_aggregation_matches_fractional_cell_method(tmp_path,geometry):
 path=raster(tmp_path);actual=aggregate(path,geometry);expected=ref.categorical([path],geometry,{0:'Not temporary crop',100:'Temporary crop'})
 assert actual['coverage_percent']==pytest.approx(expected['coverage_percent'],abs=.02)
 assert {row['code']:row['field_percent'] for row in actual['classes']}==pytest.approx({row['code']:row['field_percent'] for row in expected['classes']},abs=.02)

def test_pixel_bound_is_enforced_before_allocating_full_arrays(tmp_path,monkeypatch):
 import worldcereal_zonal
 monkeypatch.setattr(worldcereal_zonal,'MAX_PIXELS',1)
 with pytest.raises(ValueError,match='processing bound'):aggregate(raster(tmp_path),box(77,26,77.004,26.004))
