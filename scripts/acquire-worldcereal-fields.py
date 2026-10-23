#!/usr/bin/env python3
"""Acquire only matching official ZIP members, crop AOIs and register immutable field exports.
Never downloads the global archive. Per-member compressed transfer <=768 MiB;
aggregate <=1536 MiB. Existing registered field coverage is reused.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct
import sys
import zipfile
import zlib
import threading
from concurrent.futures import ThreadPoolExecutor,as_completed
import requests
import rasterio
from rasterio.windows import from_bounds, Window
from shapely.geometry import shape, box
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend/engine'))
from reference_data import RangeReader,reproject

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.local/datasets/reference/worldcereal'
URL='https://zenodo.org/records/7875105/files/WorldCereal_2021_tc-annual_temporarycrops_classification.zip?download=1'
MAX_MEMBER=768*1024*1024
MAX_TOTAL=1536*1024*1024
MAX_RAW=1024*1024*1024
RANGE_LOCK=threading.Lock()
SPEC=importlib.util.spec_from_file_location('register_aoi',ROOT/'scripts/register-worldcereal-aoi.py')
registration=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(registration)


def file_sha(path):
 digest=hashlib.sha256()
 with path.open('rb') as source:
  for chunk in iter(lambda:source.read(1024*1024),b''):digest.update(chunk)
 return digest.hexdigest()


def download_member(info,reader,budget):
 if info.flag_bits&1 or info.compress_type not in (zipfile.ZIP_DEFLATED,zipfile.ZIP_STORED):raise ValueError('Unsupported archive member')
 if info.file_size>MAX_RAW or info.compress_size>MAX_MEMBER:raise ValueError('Matching official AEZ member exceeds bounded member transfer limit; authenticated AOI export required')
 name=Path(info.filename).name
 if not re.fullmatch(r'[0-9]+_tc-annual_temporarycrops_[0-9-]+_[0-9-]+_classification.tif',name):raise ValueError('Unexpected official member name')
 folder=CACHE/'archive-members';folder.mkdir(exist_ok=True)
 path=folder/name;receipt=path.with_suffix('.source.json')
 if path.exists() and receipt.exists():
  saved=json.loads(receipt.read_text())
  if saved.get('zip_crc32')==info.CRC and saved.get('sha256')==file_sha(path):return path
  raise ValueError('Existing archive member differs; refusing overwrite')
 if path.exists():raise ValueError('Existing member lacks verified receipt; refusing overwrite')
 with RANGE_LOCK:
  if budget.get('reserved',budget['bytes'])+info.compress_size>MAX_TOTAL:raise ValueError('Aggregate download bound reached')
  budget['reserved']=budget.get('reserved',budget['bytes'])+info.compress_size
  reader.seek(info.header_offset);header=reader.read(30)
 if header[:4]!=b'PK\x03\x04':raise ValueError('Invalid ZIP local header')
 filename_length,extra_length=struct.unpack_from('<HH',header,26)
 start=info.header_offset+30+filename_length+extra_length;end=start+info.compress_size-1
 compressed_path=path.with_suffix('.zip-part');download_meta=path.with_suffix('.download.json')
 expected={'source_url':URL,'start':start,'compressed_bytes':info.compress_size,'zip_crc32':info.CRC}
 if compressed_path.is_symlink() or path.is_symlink():raise ValueError('Symlink cache refused')
 if download_meta.exists() and json.loads(download_meta.read_text())!=expected:raise ValueError('Cached download metadata differs')
 download_meta.write_text(json.dumps(expected,indent=2)+'\n')
 chunk_size=8*1024*1024
 done=compressed_path.stat().st_size if compressed_path.exists() else 0
 if done>info.compress_size:raise ValueError('Cached download exceeds official member size')
 if done!=info.compress_size and done%chunk_size:
  # A process interruption may leave a short final write; retain all complete chunks.
  done-=done%chunk_size
  with compressed_path.open('r+b') as output:output.truncate(done)
 transferred=0
 def fetch_chunk(offset):
  count=min(chunk_size,info.compress_size-offset);chunk_start=start+offset;chunk_end=chunk_start+count-1
  for attempt in range(3):
   try:
    with requests.get(URL,headers={'Range':f'bytes={chunk_start}-{chunk_end}','Accept-Encoding':'identity'},stream=True,timeout=(30,90)) as response:
     match=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',response.headers.get('Content-Range',''))
     if response.status_code!=206 or not match or int(match[1])!=chunk_start or int(match[2])!=chunk_end or int(match[3])!=reader.length:raise ValueError('Exact HTTP range response required; full archive refused')
     parts=[];received=0
     for part in response.iter_content(1024*1024):
      received+=len(part)
      if received>count:raise ValueError('Oversized range response')
      parts.append(part)
     if received!=count:raise requests.ConnectionError('Truncated range response')
     return b''.join(parts)
   except requests.RequestException:
    if attempt==2:raise
 # Four chunks per member, at most two members: bounded memory and eight transfers.
 from collections import deque
 positions=iter(range(done,info.compress_size,chunk_size))
 with ThreadPoolExecutor(max_workers=4) as transfers:
  queue=deque()
  for _ in range(4):
   offset=next(positions,None)
   if offset is not None:queue.append(transfers.submit(fetch_chunk,offset))
  while queue:
   chunk=queue.popleft().result()
   with compressed_path.open('ab') as output:output.write(chunk)
   done+=len(chunk);transferred+=len(chunk)
   if done%(32*1024*1024)==0 or done==info.compress_size:print(name.split('_')[0]+': '+str(round(done/1024/1024,1))+'/'+str(round(info.compress_size/1024/1024,1))+' MiB',flush=True)
   offset=next(positions,None)
   if offset is not None:queue.append(transfers.submit(fetch_chunk,offset))
 partial=path.with_suffix('.partial');size=0;crc=0;sha=hashlib.sha256()
 decoder=zlib.decompressobj(-15) if info.compress_type==zipfile.ZIP_DEFLATED else None
 try:
  with compressed_path.open('rb') as source,partial.open('wb') as output:
   for compressed in iter(lambda:source.read(1024*1024),b''):
    data=decoder.decompress(compressed,MAX_RAW-size+1) if decoder else compressed
    size+=len(data)
    if size>info.file_size or size>MAX_RAW:raise ValueError('Excess decompressed bytes')
    output.write(data);crc=zlib.crc32(data,crc);sha.update(data)
  if size!=info.file_size or crc!=info.CRC or (decoder and not decoder.eof):raise ValueError('Official member size/CRC validation failed')
  partial.replace(path)
  with RANGE_LOCK:budget['bytes']+=transferred
  receipt.write_text(json.dumps({'source_url':URL,'member':info.filename,'zip_crc32':crc,'sha256':sha.hexdigest(),'bytes':size,'compressed_bytes':info.compress_size},indent=2)+'\n')
  return path
 finally:
  if partial.exists():partial.unlink()


def crop(path,field):
 geom=shape(field['geometry']);folder=CACHE/'field-exports';folder.mkdir(exist_ok=True)
 destination=folder/(field['id']+'-v'+str(field['boundary_version'])+'.tif')
 if not destination.exists():
  with rasterio.open(path) as src:
   projected=reproject(geom,4326,src.crs)
   bounds=projected.bounds;window=from_bounds(*bounds,transform=src.transform)
   left=max(0,int(window.col_off)-1);top=max(0,int(window.row_off)-1)
   right=min(src.width,int(window.col_off+window.width)+2);bottom=min(src.height,int(window.row_off+window.height)+2)
   if right<=left or bottom<=top or (right-left)*(bottom-top)>5_000_000:raise ValueError('AOI exceeds pixel bound or is outside raster')
   window=Window(left,top,right-left,bottom-top);data=src.read(1,window=window)
   profile={'driver':'GTiff','width':data.shape[1],'height':data.shape[0],'count':1,'dtype':data.dtype,'crs':src.crs,'transform':src.window_transform(window),'nodata':src.nodata,'compress':'deflate'}
   with rasterio.open(destination,'w',**profile) as output:output.write(data,1)
 return registration.register(destination,URL,CACHE,field_id=field['id'])


def acquire(fields):
 manifest_path=CACHE/'manifest.json';manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'rasters':[]}
 zone_file=CACHE/'WorldCereal_AEZ.geojson'
 if not zone_file.exists():
  CACHE.mkdir(parents=True,exist_ok=True)
  with requests.get('https://zenodo.org/records/7875105/files/WorldCereal_AEZ.geojson?download=1',stream=True,timeout=(30,60)) as response:
   response.raise_for_status();chunks=[];size=0
   for chunk in response.iter_content(65536):
    size+=len(chunk)
    if size>2*1024*1024:raise ValueError('Official AEZ index exceeds size bound')
    chunks.append(chunk)
  data=b''.join(chunks)
  if hashlib.md5(data).hexdigest()!='cf1125f617b48703756329ded6e79456':raise ValueError('Official AEZ checksum mismatch')
  zone_file.write_bytes(data)
 zones=json.loads(zone_file.read_text())['features'];pending=[];results=[]
 for field in fields:
  geom=shape(field['geometry']);covered=False
  for entry in manifest['rasters']:
   if entry.get('field_ids') and field['id'] not in entry['field_ids']:continue
   with rasterio.open(CACHE/entry['file']) as raster:
    if box(*raster.bounds).covers(reproject(geom,4326,raster.crs)):covered=True;break
  if covered:results.append({'field_id':field['id'],'status':'existing_aoi_reused'});continue
  zone_ids=[str(zone['properties']['aez_id']) for zone in zones if shape(zone['geometry']).covers(geom)]
  if len(zone_ids)!=1:results.append({'field_id':field['id'],'status':'blocked','reason':'AOI crosses or lacks an official AEZ; authenticated export required'});continue
  pending.append((field,zone_ids[0]))
 reader=RangeReader(URL) if pending else None;archive=zipfile.ZipFile(reader) if reader else None;budget={'bytes':0};members={};blocked={}
 # At most two independent regional transfers; field crops are registered sequentially.
 def acquire_zone(zone):
  info=next(x for x in archive.infolist() if Path(x.filename).name.startswith(zone+'_') and x.filename.endswith('_classification.tif'))
  print('Acquiring official AEZ '+zone+' ('+str(round(info.compress_size/1024/1024,1))+' MiB)',flush=True)
  return download_member(info,reader,budget)
 with ThreadPoolExecutor(max_workers=2) as executor:
  futures={executor.submit(acquire_zone,zone):zone for zone in sorted({zone for _,zone in pending})}
  for future in as_completed(futures):
   zone=futures[future]
   try:members[zone]=future.result()
   except (ValueError,OSError,requests.RequestException,StopIteration,rasterio.errors.RasterioError) as error:blocked[zone]=str(error)
 for field,zone in pending:
  try:
   if zone in blocked:raise ValueError(blocked[zone])
   candidates=[members[zone]]+[p for p in members.values() if p!=members[zone]]
   candidates+=sorted(p for p in (CACHE/'archive-members').glob('*.tif') if p not in candidates and p.with_suffix('.source.json').exists())
   selected=None
   for candidate in candidates:
    # Preserve official AEZ applicability; neighboring seasonal maps are not substitutes.
    applicable={str(item['properties']['aez_id']) for item in zones if shape(item['geometry']).intersects(shape(field['geometry']))}
    if candidate.name.split('_')[0] not in applicable:continue
    with rasterio.open(candidate) as src:
     projected=reproject(shape(field['geometry']),4326,src.crs)
     if not box(*src.bounds).covers(projected):continue
     sample_window=from_bounds(*projected.bounds,transform=src.transform).round_offsets().round_lengths()
     if sample_window.width*sample_window.height>5_000_000:continue
     if src.read(1,window=sample_window,masked=True).count()==0:continue
    if candidate not in members.values():
     evidence=json.loads(candidate.with_suffix('.source.json').read_text())
     if evidence.get('source_url')!=URL or evidence.get('sha256')!=file_sha(candidate):continue
    selected=candidate;break
   if selected is None:raise ValueError('No available official regional raster covers this field within the processing bound')
   registered=crop(selected,field);results.append({'field_id':field['id'],'source_member':selected.name,**registered})
  except (ValueError,OSError,rasterio.errors.RasterioError) as error:results.append({'field_id':field['id'],'status':'blocked','reason':str(error)})
 report={'source_url':URL,'downloaded_bytes':budget['bytes'],'results':results}
 (CACHE/'field-acquisition-report.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'downloaded_bytes':budget['bytes'],'registered':sum(x['status']=='registered' for x in results),'reused':sum(x['status'] in ['already_registered','existing_aoi_reused'] for x in results),'blocked':sum(x['status']=='blocked' for x in results)},indent=2))

if __name__=='__main__':acquire(json.loads((CACHE.parent/'pending-field-boundaries.json').read_text()))
