#!/usr/bin/env python3
"""Register an official AOI export without replacing any existing raster or manifest entry."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
from urllib.parse import urlparse
import rasterio

ROOT=Path('.local/datasets/reference/worldcereal')
MAX_BYTES=64*1024*1024

def register(raster,source_url,root=ROOT):
 raster=Path(raster);root=Path(root)
 url=urlparse(source_url)
 if url.scheme!='https' or url.hostname not in {'hub.esa-worldcereal.org','zenodo.org'}:
  raise ValueError('Official WorldCereal HTTPS source required')
 if not raster.is_file() or raster.is_symlink() or not 0<raster.stat().st_size<=MAX_BYTES:
  raise ValueError('A bounded official AOI GeoTIFF is required')
 with rasterio.open(raster) as ds:
  if ds.driver!='GTiff' or not ds.crs or ds.count!=1 or ds.width*ds.height>250000:raise ValueError('Single-band georeferenced GeoTIFF required')
  values=set(ds.read(1,masked=True).compressed().tolist())
  if not values or not values.issubset({0,100}):raise ValueError('Expected 2021 temporary-crop classification codes 0/100')
  info={'bounds':list(ds.bounds),'crs':str(ds.crs),'shape':[ds.height,ds.width]}
 digest=hashlib.sha256(raster.read_bytes()).hexdigest()
 root.mkdir(parents=True,exist_ok=True);path=root/'manifest.json'
 manifest=json.loads(path.read_text()) if path.exists() else {'product':'temporarycrops','version':'2021 v100','license':'CC BY 4.0','rasters':[]}
 if any(manifest.get(key)!=value for key,value in [('product','temporarycrops'),('version','2021 v100'),('license','CC BY 4.0')]):raise ValueError('Existing manifest identifies a different product')
 if any(row.get('sha256')==digest for row in manifest['rasters']):return {'status':'already_registered','sha256':digest,'manifest':str(path)}
 name='temporarycrops-2021-'+digest[:16]+'.tif';destination=root/name
 if destination.is_symlink():raise ValueError('Symlink destination refused')
 if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest()!=digest:raise ValueError('Existing file differs; refusing overwrite')
 if not destination.exists():shutil.copyfile(raster,destination)
 manifest['rasters'].append({'file':name,'source_url':source_url,'sha256':digest,'raster':info})
 temp=path.with_suffix('.json.tmp');temp.write_text(json.dumps(manifest,indent=2)+'\n');os.replace(temp,path)
 return {'status':'registered','sha256':digest,'manifest':str(path),'raster':info}

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('raster',type=Path);p.add_argument('--source-url',required=True);a=p.parse_args()
 try:print(json.dumps(register(a.raster,a.source_url),indent=2))
 except (ValueError,OSError,rasterio.errors.RasterioError) as error:p.exit(1,str(error)+'\n')
