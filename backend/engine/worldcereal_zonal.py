"""Bounded exact equal-area aggregation for large, north-up WGS84 WorldCereal AOIs.
Interior cell areas are counted by row; only polygon-boundary cells need intersections.
The EPSG:6933 cylindrical equal-area grid gives constant cell area within each row.
"""
import math
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import from_bounds,Window
from pyproj import Transformer
from shapely.geometry import mapping,box
from shapely.ops import transform

MAX_PIXELS=5_000_000
LABELS={0:'Not temporary crop',100:'Temporary crop'}

def aggregate(path,geometry):
 projection=Transformer.from_crs(4326,6933,always_xy=True)
 projected=transform(projection.transform,geometry);field_area=projected.area
 if field_area<=0:raise ValueError('Field area must be positive')
 with rasterio.open(path) as src:
  if src.crs.to_epsg()!=4326 or src.transform.b or src.transform.d or src.transform.a<=0 or src.transform.e>=0:
   raise ValueError('Large WorldCereal aggregation requires a north-up WGS84 raster')
  raw=from_bounds(*geometry.bounds,transform=src.transform)
  left=max(0,math.floor(raw.col_off));top=max(0,math.floor(raw.row_off))
  right=min(src.width,math.ceil(raw.col_off+raw.width));bottom=min(src.height,math.ceil(raw.row_off+raw.height))
  width=right-left;height=bottom-top
  if width<=0 or height<=0:raise ValueError('Field lies outside raster coverage')
  if width*height>MAX_PIXELS:raise ValueError('WorldCereal AOI exceeds five-million-pixel processing bound')
  window=Window(left,top,width,height);grid=src.window_transform(window)
  array=src.read(1,window=window,masked=True);valid=~np.ma.getmaskarray(array);data=array.data
  if not set(np.unique(data[valid]).tolist()).issubset(LABELS):raise ValueError('Unexpected WorldCereal classification code')
  centers=rasterize([(mapping(geometry),1)],out_shape=(height,width),transform=grid,fill=0,dtype='uint8').astype(bool)
  touched=rasterize([(mapping(geometry),1)],out_shape=(height,width),transform=grid,fill=0,all_touched=True,dtype='uint8').astype(bool)
  edges=rasterize([(mapping(geometry.boundary),1)],out_shape=(height,width),transform=grid,fill=0,all_touched=True,dtype='uint8').astype(bool)
  interior=centers&~edges&valid
  boundary=touched&~interior&valid
  longitudes=grid.c+np.arange(width+1)*grid.a
  latitudes=grid.f+np.arange(height+1)*grid.e
  xs=np.asarray(projection.transform(longitudes,np.full(width+1,grid.f))[0])
  ys=np.asarray(projection.transform(np.full(height+1,grid.c),latitudes)[1])
  row_areas=np.abs(np.diff(ys))*abs(xs[1]-xs[0])
  areas={code:float(np.dot(np.sum(interior&(data==code),axis=1),row_areas)) for code in LABELS}
  for row,col in zip(*np.nonzero(boundary)):
   cell=box(min(xs[col],xs[col+1]),min(ys[row],ys[row+1]),max(xs[col],xs[col+1]),max(ys[row],ys[row+1]))
   areas[int(data[row,col])]+=cell.intersection(projected).area
 total=sum(areas.values())
 return {'field_area_m2':field_area,'coverage_percent':min(100,total/field_area*100),'missing_percent':max(0,100-total/field_area*100),
  'classes':[{'code':code,'label':LABELS[code],'area_m2':area,'field_percent':area/field_area*100,'valid_percent':area/total*100} for code,area in areas.items() if area>0],
  'aggregation':'EPSG:6933 row-area counts with fractional polygon-boundary clipping','processed_pixels':width*height}
