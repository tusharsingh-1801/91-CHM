"""Bounded public reference extraction. Never writes farm observations or crop identity."""
import calendar
import csv
import hashlib
import io
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta, datetime, timezone

import numpy as np
import rasterio
from rasterio.windows import Window, from_bounds
from shapely.geometry import shape, mapping, Polygon
from shapely.ops import transform
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.local/datasets/reference'
MAX_BYTES = 64 * 1024 * 1024
MAX_LABEL_BYTES = 96 * 1024 * 1024
MAX_PIXELS = 250_000
PROVIDERS = ('worldcover', 'chirps', 'soilgrids', 'worldcereal', 'cropharvest', 'fao-calendar')
SOURCES = {
 'worldcover': ('ESA WorldCover / Copernicus', '2021 v200', 'https://esa-worldcover.org/en/data-access', 'CC BY 4.0'),
 'chirps': ('UCSB Climate Hazards Center', '3.0 daily; final rnl / preliminary sat', 'https://data.chc.ucsb.edu/products/CHIRPS/v3.0/', 'CC BY 4.0; preserve CHC citation'),
 'soilgrids': ('ISRIC SoilGrids', '2.0', 'https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_02.html', 'CC BY 4.0'),
 'worldcereal': ('ESA WorldCereal / Van Tricht et al.', '2021 v100', 'https://zenodo.org/records/7875105', 'CC BY 4.0'),
 'cropharvest': ('NASA Harvest CropHarvest', '10251170', 'https://zenodo.org/records/10251170', 'CC BY-SA 4.0; constituent terms also apply'),
 'fao-calendar': ('FAO Crop Calendar', 'manual regional reference', 'https://cropcalendar.apps.fao.org/', 'Per-record permission required'),
}
CLASSES = {10:'Trees',20:'Shrubland',30:'Grassland',40:'Cropland',50:'Built-up',60:'Bare / sparse vegetation',70:'Snow / ice',80:'Water',90:'Herbaceous wetland',95:'Mangroves',100:'Moss / lichen'}

class Unavailable(Exception):
    def __init__(self, url, message, http_status=None):
        super().__init__(message)
        self.url, self.http_status = url, http_status

def fetch(url, limit=MAX_BYTES, refresh=False):
    """Atomic, bounded cache. No credentials, retries, or speculative endpoint fallback."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.bin')
    if path.exists() and not refresh:
        if path.stat().st_size > limit:
            raise ValueError('Cached file exceeds size bound')
        return path
    try:
        request = urllib.request.Request(url, headers={'User-Agent':'TerraScope-reference/1.0'})
        with urllib.request.urlopen(request, timeout=30) as response:
            if int(response.headers.get('Content-Length', 0)) > limit:
                raise Unavailable(url, f'Provider file exceeds {limit} byte bound')
            content = response.read(limit + 1)
            if len(content) > limit:
                raise Unavailable(url, f'Provider file exceeds {limit} byte bound')
        temp = path.with_suffix('.tmp')
        temp.write_bytes(content)
        temp.replace(path)
        return path
    except urllib.error.HTTPError as exc:
        raise Unavailable(url, f'HTTP {exc.code} {exc.reason}', exc.code) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise Unavailable(url, f'{type(exc).__name__}: {exc}') from exc

def reproject(geometry, source, target):
    return transform(Transformer.from_crs(source, target, always_xy=True).transform, geometry)

def geometry_of(field):
    obj = field.get('geometry')
    if not obj:
        raise ValueError('Actual field polygon required')
    geom = shape(obj)
    if geom.geom_type not in ('Polygon','MultiPolygon') or not geom.is_valid or geom.is_empty:
        raise ValueError('Valid Polygon or MultiPolygon required')
    west,south,east,north = geom.bounds
    if not (-180 <= west < east <= 180 and -85 <= south < north <= 85) or east-west > 5 or north-south > 5:
        raise ValueError('AOI exceeds supported bounds; split large/dateline polygons')
    if reproject(geom,4326,6933).area > 100_000_000:
        raise ValueError('AOI limit is 100 square kilometres')
    return geom

class RangeReader(io.RawIOBase):
    """Seekable HTTP file with a hard aggregate transfer budget and bounded block cache."""
    def __init__(self,url,budget=None):
        self.url=url
        self.position=0
        self.budget=budget if budget is not None else {'bytes':0}
        self.blocks={}
        self.block_size=64*1024
        chunk, total=self._range(0,self.block_size-1)
        self.length=total
        self.blocks[0]=chunk
    def _range(self,start,end):
        try:
            request=urllib.request.Request(self.url,headers={'Range':f'bytes={start}-{end}','Accept-Encoding':'identity'})
            with urllib.request.urlopen(request,timeout=30) as response:
                content_range=response.headers.get('Content-Range','')
                match=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',content_range)
                if response.status!=206 or not match or int(match[1])!=start:
                    raise Unavailable(self.url,'Valid HTTP range response required; full download refused',response.status)
                last,total=int(match[2]),int(match[3])
                if total<=start or last!=min(end,total-1):
                    raise Unavailable(self.url,'Incomplete or invalid HTTP range response',response.status)
                expected=last-start+1
                if self.budget['bytes']+expected>MAX_BYTES:
                    raise Unavailable(self.url,'64 MiB aggregate raster transfer budget exceeded')
                data=response.read(expected+1)
                if len(data)!=expected:
                    raise Unavailable(self.url,'Truncated or oversized HTTP range')
                self.budget['bytes']+=len(data)
                return data,int(match[3])
        except urllib.error.HTTPError as exc:
            raise Unavailable(self.url,f'HTTP {exc.code} {exc.reason}',exc.code) from exc
        except (urllib.error.URLError,TimeoutError,OSError) as exc:
            raise Unavailable(self.url,f'{type(exc).__name__}: {exc}') from exc
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self,offset,whence=0):
        target=offset if whence==0 else self.position+offset if whence==1 else self.length+offset
        if target<0: raise ValueError('Negative seek')
        self.position=target
        return target
    def read(self,size=-1):
        if size<0: size=self.length-self.position
        size=min(size,max(0,self.length-self.position))
        if size>MAX_BYTES: raise Unavailable(self.url,'Raster read exceeds byte budget')
        result=bytearray()
        while size:
            block=self.position//self.block_size
            if block not in self.blocks:
                chunk,total=self._range(block*self.block_size,min(self.length-1,(block+1)*self.block_size-1))
                if total!=self.length: raise Unavailable(self.url,'Remote file changed during read')
                self.blocks[block]=chunk
            chunk=self.blocks[block]
            offset=self.position%self.block_size
            count=min(size,len(chunk)-offset)
            if count<=0: raise Unavailable(self.url,'Unexpected end of raster')
            result.extend(chunk[offset:offset+count])
            self.position+=count
            size-=count
        return bytes(result)
    def readinto(self,buffer):
        data=self.read(len(buffer));buffer[:len(data)]=data;return len(data)

def subset(url, geom, refresh=False):
    """Cache native-resolution AOI, with hard 64 MiB transfer and 250k pixel limits."""
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256((url + geom.wkb_hex).encode()).hexdigest()
    path = CACHE / (key + '.tif')
    if path.exists() and not refresh:
        return path
    reader=RangeReader(url)
    def opener(name,mode='r'):
        if name!=url: raise FileNotFoundError(name)
        reader.seek(0)
        return reader
    # Custom filesystem opener requires rasterio >= 1.4; it prevents GDAL from
    # silently retrieving an entire global image when Range is unsupported.
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
        with rasterio.open(url,opener=opener) as src:
            if not src.crs: raise ValueError('Raster has no CRS')
            projected = reproject(geom,4326,src.crs)
            w = from_bounds(*projected.bounds, transform=src.transform)
            left, top = math.floor(w.col_off), math.floor(w.row_off)
            window = Window(left,top,math.ceil(w.col_off+w.width)-left,math.ceil(w.row_off+w.height)-top).intersection(Window(0,0,src.width,src.height))
            if window.width*window.height > MAX_PIXELS: raise ValueError('AOI raster exceeds pixel bound')
            bh,bw = src.block_shapes[0]
            if bh*bw*np.dtype(src.dtypes[0]).itemsize > MAX_BYTES: raise Unavailable(url,'Raster storage block exceeds read bound')
            data = src.read(1,window=window,masked=True)
            profile = dict(driver='GTiff',height=data.shape[0],width=data.shape[1],count=1,dtype=src.dtypes[0],crs=src.crs,transform=src.window_transform(window),nodata=src.nodata,compress='deflate')
            temp = path.with_suffix('.tmp.tif')
            with rasterio.open(temp,'w',**profile) as dst:
                dst.write(data.filled(src.nodata or 0),1)
                dst.write_mask((~np.ma.getmaskarray(data)).astype('uint8')*255)
            temp.replace(path)
    return path

def areas(path, geom, allowed=None):
    """Fractional pixel/polygon intersections measured in equal-area CRS, excluding nodata."""
    result = {}
    with rasterio.open(path) as src:
        if not src.crs:
            raise ValueError('Raster has no CRS')
        if src.width*src.height > MAX_PIXELS:
            raise ValueError('Raster exceeds pixel bound')
        projected = reproject(geom,4326,src.crs)
        values = src.read(1,masked=True)
        for row,col in np.ndindex(values.shape):
            value = values[row,col]
            if np.ma.is_masked(value) or not np.isfinite(value):
                continue
            if allowed is not None and int(value) not in allowed:
                continue
            cell = Polygon([src.transform*(col,row),src.transform*(col+1,row),src.transform*(col+1,row+1),src.transform*(col,row+1)])
            clipped = projected.intersection(cell)
            if clipped.is_empty or clipped.area == 0:
                continue
            area = reproject(clipped,src.crs,6933).area
            result[float(value)] = result.get(float(value),0) + area
    return result

def categorical(paths, geom, classes):
    totals = {}
    for path in paths:
        for value,area in areas(path,geom,classes).items():
            totals[value] = totals.get(value,0)+area
    field_area = reproject(geom,4326,6933).area
    valid = sum(totals.values())
    if valid > field_area * 1.001:
        raise ValueError('Overlapping rasters would double-count field area')
    return {'coverage_percent':min(100,100*valid/field_area),'field_area_m2':field_area,
            'classes':[{'code':int(k),'label':classes[int(k)],'area_m2':v,'field_percent':100*v/field_area,'valid_percent':100*v/valid} for k,v in sorted(totals.items())],
            'missing_percent':max(0,100-100*valid/field_area)}

def worldcover(field, options):
    import fiona
    geom = geometry_of(field)
    index = CACHE / 'worldcover-grid.fgb'
    if not index.exists():
        index = fetch('https://esa-worldcover.s3.amazonaws.com/v200/2021/esa_worldcover_grid.fgb',2*1024*1024)
    tiles = []
    with fiona.open(index) as collection:
        query_geom = reproject(geom,4326,collection.crs)
        for feature in collection.filter(bbox=query_geom.bounds):
            if shape(feature['geometry']).intersection(query_geom).area > 0:
                tiles.append(feature['properties']['ll_tile'])
    if not tiles or len(tiles)>4:
        raise ValueError('No coverage or more than four WorldCover tiles')
    urls = [f'https://esa-worldcover.s3.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif' for tile in tiles]
    stats = categorical([subset(u,geom) for u in urls],geom,CLASSES)
    stats['cropland_percent'] = next((x['field_percent'] for x in stats['classes'] if x['code']==40),0) if stats['coverage_percent'] else None
    return dict(stats,source_urls=urls,period='2021',resolution='10 m',note='Historical land cover; cropland does not identify a crop')

def rainfall_summary(days):
    months = {}
    for entry in days:
        month = entry['date'][:7]
        group = months.setdefault(month,{'month':month,'available_days':0,'requested_days':0,'final_days':0,'preliminary_days':0,'unavailable_days':0,'source_urls':[],'sum_available_mm':None,'complete_calendar_month':False})
        group['requested_days'] += 1
        if entry['mm'] is not None:
            group['available_days'] += 1
            group['sum_available_mm'] = (group['sum_available_mm'] or 0) + entry['mm']
        revision=entry.get('revision','unavailable')
        if revision=='final':
            group['final_days']+=1
        elif revision=='preliminary':
            group['preliminary_days']+=1
        else:
            group['unavailable_days']+=1
        if entry.get('url') and entry['url'] not in group['source_urls']:
            group['source_urls'].append(entry['url'])
    for group in months.values():
        year,month = map(int,group['month'].split('-'))
        group['complete_calendar_month'] = group['requested_days']==calendar.monthrange(year,month)[1] and group['available_days']==group['requested_days']
    return list(months.values())

class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a':
            self.hrefs.extend(value for key,value in attrs if key=='href' and value)

def directory_links(url):
    parser=Links()
    parser.feed(fetch(url,4*1024*1024,refresh=True).read_text())
    # Only follow URLs actually advertised by this official directory.
    return [urllib.parse.urljoin(url,h) for h in parser.hrefs if urllib.parse.urljoin(url,h).startswith(url)]

def chirps_files(base,years):
    years_links=directory_links(base)
    files={}
    for year in years:
        year_url=next((u for u in years_links if urllib.parse.urlparse(u).path.rstrip('/').split('/')[-1]==str(year) and u.endswith('/')),None)
        if year_url is None: continue
        for url in directory_links(year_url):
            match=re.search(r'(\d{4})\.(\d{2})\.(\d{2})\.tif$',url)
            if match:
                files['-'.join(match.groups())]=url
    return files

def chirps(field,options):
    geom = geometry_of(field)
    if geom.bounds[1] < -60 or geom.bounds[3] > 60:
        raise ValueError('CHIRPS v3 coverage is 60 S to 60 N')
    start,end = date.fromisoformat(options['start']),date.fromisoformat(options['end'])
    if start < date(1981,1,1) or end < start or (end-start).days > 365 or end > date.today():
        raise ValueError('CHIRPS requires 1981..today and at most 366 days')
    years=range(start.year,end.year+1)
    final=chirps_files('https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/',years)
    requested=[start+timedelta(days=offset) for offset in range((end-start).days+1)]
    prelim={}
    if any(str(day) not in final for day in requested):
        prelim=chirps_files('https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/prelim/sat/',years)
    field_area=reproject(geom,4326,6933).area
    def extract_day(url,revision):
        try:
            values=areas(subset(url,geom,refresh=revision=='preliminary'),geom)
            values={v:a for v,a in values.items() if v>=0}
            total=sum(values.values())
            return {'mm':sum(v*a for v,a in values.items())/total if total else None,'coverage_percent':min(100,100*total/field_area),'revision':revision,'source':'UCSB CHC CHIRPS v3','disaggregation':'rnl' if revision=='final' else 'sat','url':url},None
        except Unavailable as exc:
            return None,exc
    days=[]
    for day in requested:
        key=str(day)
        url=final.get(key) or prelim.get(key)
        revision='final' if key in final else 'preliminary'
        if url is None:
            days.append({'date':key,'mm':None,'revision':'unavailable','source':'UCSB CHC CHIRPS v3','error':'Date not advertised by official final or preliminary directories'})
            continue
        record,error=extract_day(url,revision)
        if error and error.http_status==404 and revision=='final':
            if not prelim:
                try:
                    prelim=chirps_files('https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/prelim/sat/',years)
                except Unavailable:
                    prelim={}
            if key in prelim:
                url,revision=prelim[key],'preliminary'
                record,error=extract_day(url,revision)
        if error:
            days.append({'date':key,'mm':None,'coverage_percent':0,'revision':'unavailable','source':'UCSB CHC CHIRPS v3','url':url,'error':str(error),'http_status':error.http_status})
        else:
            days.append({'date':key,**record})
    return {'period':f'{start}/{end}','resolution':'0.05 degrees','units':'mm','daily':days,'monthly':rainfall_summary(days),'coverage_percent':sum(d.get('coverage_percent',0) for d in days)/len(days),'temporal_coverage_percent':100*sum(d['mm'] is not None for d in days)/len(days),'note':'CHIRPS v3: final rnl (ERA5 daily disaggregation), preliminary sat (IMERG) only when final is not advertised. Re-run to replace preliminary with final. Spatial coverage is reported as a percent averaged across requested days; temporal coverage is separately reported as percent of available days. Area-weighted grid estimates, separate from NASA POWER. Missing days are not zero.'}

SOIL = {'phh2o':(10,'pH'),'soc':(10,'g/kg'),'nitrogen':(100,'g/kg'),'sand':(10,'%'),'silt':(10,'%'),'clay':(10,'%')}
def soilgrids(field,options):
    geom=geometry_of(field)
    soil_crs='+proj=igh +datum=WGS84 +no_defs +towgs84=0,0,0'
    projected=reproject(geom,4326,soil_crs)
    min_x,min_y,max_x,max_y=projected.bounds
    field_area=reproject(geom,4326,6933).area
    min_x=math.floor((min_x-250)/250)*250
    max_x=math.ceil((max_x+250)/250)*250
    min_y=math.floor((min_y-250)/250)*250
    max_y=math.ceil((max_y+250)/250)*250
    width=round((max_x-min_x)/250)
    height=round((max_y-min_y)/250)
    if width*height>MAX_PIXELS:
        raise ValueError('SoilGrids WCS request exceeds pixel bound')
    values=[]
    for prop,(factor,unit) in SOIL.items():
        estimates={}
        coverage_by_statistic={}
        urls=[]
        for statistic,coverage_statistic in (('mean','mean'),('Q05','Q0.05'),('Q95','Q0.95'),('uncertainty','uncertainty')):
            coverage=f'{prop}_0-5cm_{coverage_statistic}'
            params=[('SERVICE','WCS'),('VERSION','2.0.1'),('REQUEST','GetCoverage'),('COVERAGEID',coverage),('FORMAT','GEOTIFF_INT16'),('SUBSETTINGCRS','http://www.opengis.net/def/crs/EPSG/0/152160'),('OUTPUTCRS','http://www.opengis.net/def/crs/EPSG/0/152160'),('SUBSET',f'X({min_x},{max_x})'),('SUBSET',f'Y({min_y},{max_y})')]
            url=f'https://maps.isric.org/mapserv?map=/map/{prop}.map&'+urllib.parse.urlencode(params)
            urls.append(url)
            path=fetch(url,2*1024*1024)
            cell_areas=areas(path,geom)
            # ISRIC WCS Int16 encodes missing predictions as 0 and missing
            # uncertainty as the Int16 maximum; neither is a soil estimate.
            cell_areas={value:area for value,area in cell_areas.items() if 0<value<32767}
            covered_area=sum(cell_areas.values())
            estimates[statistic]=(sum(value*area for value,area in cell_areas.items())/covered_area/factor) if covered_area else None
            coverage_by_statistic[statistic]=min(100,100*covered_area/field_area) if field_area else 0
        values.append({'variable':prop,'depth':'0-5cm','unit':unit,**estimates,'coverage_percent':min(coverage_by_statistic.values()),'source_urls':urls})
    if not any(v['mean'] is not None for v in values):
        raise Unavailable(SOURCES['soilgrids'][2],'No valid soil predictions at the field point')
    return {'period':'SoilGrids 2.0','resolution':'250 m','field_area_m2':field_area,'coverage_percent':min(v['coverage_percent'] for v in values),'variables':values,'note':'Field-area-weighted modeled soil estimates, not lab-tested values. Q05–Q95 are the official lower/upper prediction quantiles. Surface depth only.'}

def worldcereal(field, options):
    # The official authenticated AOI export is preferred over the 15.5 GB global archive.
    geom=geometry_of(field)
    manifest_path=CACHE/'worldcereal/manifest.json'
    if not manifest_path.exists():
        # Probe the public metadata, recording exact access errors when offline.
        fetch('https://zenodo.org/api/records/7875105',2*1024*1024)
        return {'status':'not_configured','note':'Export 2021 v100 temporarycrops classification GeoTIFF for the AOI from https://hub.esa-worldcereal.org (CDSE login), then supply .local/datasets/reference/worldcereal/manifest.json. Global 15.5 GB archive refused.'}
    manifest=json.loads(manifest_path.read_text())
    if manifest.get('product')!='temporarycrops' or manifest.get('version')!='2021 v100' or manifest.get('license')!='CC BY 4.0':
        raise ValueError('WorldCereal manifest must identify licensed 2021 v100 temporarycrops classification')
    files=[];selected=[]
    for item in manifest['rasters']:
        path=(manifest_path.parent/item['file']).resolve()
        if not path.is_relative_to(manifest_path.parent.resolve()) or path.stat().st_size>MAX_BYTES:
            raise ValueError('WorldCereal raster path/size invalid')
        if not item.get('source_url','').startswith(('https://hub.esa-worldcereal.org/','https://zenodo.org/')):
            raise ValueError('Official WorldCereal export provenance required')
        if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
            raise ValueError('WorldCereal checksum mismatch')
        with rasterio.open(path) as src:
            if reproject(geom,4326,src.crs).intersects(Polygon.from_bounds(*src.bounds)):
                files.append(path);selected.append({'sha256':item['sha256'],'source_url':item['source_url'],'bounds':list(src.bounds),'crs':str(src.crs)})
    if not files:
        return {'status':'not_configured','availability':'aoi_export_required','period':'2021','note':'Existing official raster does not cover this field. A matching official WorldCereal AOI export is required; existing rasters are preserved.'}
    stats=categorical(files,geom,{0:'Not temporary crop',100:'Temporary crop'})
    return dict(stats,period='2021',resolution='10 m',product='temporarycrops',raster_provenance=selected,source_urls=[x['source_url'] for x in selected],note='Historical temporary-crop extent; not current farm crop identity')

def cropharvest_feature_summary(folder):
    receipt=folder/'feature-acquisition.json'
    if not receipt.is_file():
        return {'feature_sample_count':0,'feature_status':'not_downloaded','training_status':'not_trained'}
    manifest=json.loads(receipt.read_text())
    samples=manifest.get('samples')
    if manifest.get('record')!='10251170' or manifest.get('license')!='CC BY-SA 4.0' or not isinstance(samples,list) or not samples or len(samples)>150000:
        raise ValueError('Invalid CropHarvest feature receipt')
    total=0
    seen=set()
    for sample in samples:
        if not isinstance(sample,dict) or not re.fullmatch(r'[0-9]+_[A-Za-z0-9._-]+',str(sample.get('id',''))):
            raise ValueError('Invalid feature sample ID')
        candidate=folder/str(sample.get('file',''))
        if candidate.is_symlink():
            raise ValueError('Symlink feature sample refused')
        path=candidate.resolve()
        if not path.is_relative_to(folder.resolve()) or path.name!=sample['id']+'.h5' or not path.is_file() or path.is_symlink():
            raise ValueError('Feature sample missing or outside cache')
        size=path.stat().st_size
        total+=size
        if sample['id'] in seen or size!=sample.get('size_bytes') or size>64*1024*1024 or total>1024*1024*1024:
            raise ValueError('Feature sample size or duplicate validation failed')
        seen.add(sample['id'])
        if hashlib.sha256(path.read_bytes()).hexdigest()!=sample.get('sha256'):
            raise ValueError('Feature sample checksum mismatch')
    if manifest.get('sample_count')!=len(samples):
        raise ValueError('Feature sample count mismatch')
    return {'feature_sample_count':len(samples),'feature_status':'downloaded_verified','feature_bytes':total,
            'feature_source_url':manifest.get('source_url'),'feature_receipt_sha256':hashlib.sha256(receipt.read_bytes()).hexdigest(),
            'training_status':'not_trained','note_features':'Processed research features, not farm measurements. Source attribution and independent evaluation remain required.'}


def cropharvest(field,options):
    metadata=json.loads(fetch('https://zenodo.org/api/records/10251170',2*1024*1024).read_text())
    if metadata.get('id')!=10251170 or metadata.get('metadata',{}).get('license',{}).get('id')!='cc-by-sa-4.0':
        raise ValueError('CropHarvest Zenodo record ID or CC BY-SA 4.0 license does not match the pinned source')
    labels=next((f for f in metadata['files'] if f['key']=='labels.geojson'),None)
    if not labels:
        raise ValueError('Pinned CropHarvest record does not list labels.geojson')
    label_url=labels.get('links',{}).get('self','')
    if not label_url.startswith('https://zenodo.org/api/records/10251170/files/labels.geojson/'):
        raise ValueError('CropHarvest labels must come from the pinned Zenodo record')
    if labels.get('size',0)>MAX_LABEL_BYTES:
        raise Unavailable(label_url,f'CropHarvest labels exceed {MAX_LABEL_BYTES} byte bound')
    cached=fetch(label_url,MAX_LABEL_BYTES)
    checksum=labels.get('checksum','')
    if not re.fullmatch(r'md5:[a-f0-9]{32}',checksum):
        raise ValueError('CropHarvest record has no valid pinned MD5 checksum')
    content=cached.read_bytes()
    if checksum.startswith('md5:') and hashlib.md5(content).hexdigest()!=checksum[4:]:
        raise ValueError('CropHarvest label checksum mismatch')
    folder=CACHE/'cropharvest'
    folder.mkdir(parents=True,exist_ok=True)
    path=folder/'labels.geojson'
    temp=path.with_suffix('.tmp')
    temp.write_bytes(content)
    temp.replace(path)
    return {'status':'downloaded','file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(content).hexdigest(),'label_count':len(json.loads(content)['features']),'record_checksum':checksum,**cropharvest_feature_summary(folder),'note':'Official CC BY-SA 4.0 benchmark data; constituent source terms still apply. Training requires per-source licensing and held-out groups. No model or accuracy is implied by acquisition.'}

def fao_calendar(field,options):
    supplied=options.get('fao_calendar_csv')
    if not supplied:
        fixture=json.loads((ROOT/'datasets/calendar/india-crop-calendar.demo.json').read_text())
        recommendations=[dict(row,source_title=fixture['source'],source_url=fixture['source_url'],license=fixture['license'],accessed_on='2026-10-23',permission_reference='Synthetic demo fixture; not FAO source data') for row in fixture['recommendations']]
        return {'status':'manual','mode':'demo','is_demo':True,'availability':'demo_fallback','period':'illustrative seasonal windows',
                'recommendations':recommendations,'official_data_status':'India not listed in official FAO API country coverage on 2026-10-23',
                'official_source_url':'https://api-cropcalendar.apps.fao.org/api/v1/countries?language=en','note':fixture['notice']}
    path=Path(supplied).expanduser().resolve()
    if not path.is_file() or path.stat().st_size>4*1024*1024:
        raise ValueError('FAO calendar CSV must be a readable file no larger than 4 MiB')
    required={'field_id','country_iso3','region','agroecological_zone','crop','season','planting_start_month','planting_end_month','harvest_start_month','harvest_end_month','source_url','source_title','accessed_on','license','permission_reference'}
    recommendations=[]
    seen=set()
    try:
        with path.open('r',encoding='utf-8-sig',newline='') as stream:
            reader=csv.DictReader(stream)
            if not reader.fieldnames or not required.issubset(reader.fieldnames):
                raise ValueError(f'FAO calendar CSV is missing columns: {", ".join(sorted(required-set(reader.fieldnames or [])))}')
            for line,row in enumerate(reader,2):
                if line>5001:
                    raise ValueError('FAO calendar CSV exceeds 5,000 rows')
                if not row or not any((value or '').strip() for value in row.values()):
                    continue
                if (row.get('field_id') or '').strip()!=str(field['id']):
                    continue
                missing=[key for key in required if not (row.get(key) or '').strip()]
                if missing:
                    raise ValueError(f'FAO calendar CSV row {line} is missing required provenance or calendar fields')
                if not re.fullmatch(r'[A-Z]{3}',row['country_iso3'].strip()):
                    raise ValueError(f'FAO calendar CSV row {line} has an invalid ISO3 country code')
                try:
                    months={key:int(row[key]) for key in ('planting_start_month','planting_end_month','harvest_start_month','harvest_end_month')}
                    accessed=date.fromisoformat(row['accessed_on'].strip())
                except ValueError as exc:
                    raise ValueError(f'FAO calendar CSV row {line} has invalid month/date values') from exc
                if any(month<1 or month>12 for month in months.values()) or accessed>date.today():
                    raise ValueError(f'FAO calendar CSV row {line} has out-of-range month/date values')
                source_url=row['source_url'].strip()
                host=urllib.parse.urlparse(source_url).hostname or ''
                if urllib.parse.urlparse(source_url).scheme!='https' or not (host=='fao.org' or host.endswith('.fao.org')):
                    raise ValueError(f'FAO calendar CSV row {line} must cite an HTTPS FAO source URL')
                key=(row['country_iso3'].strip(),row['region'].strip(),row['crop'].strip().casefold(),row['season'].strip().casefold())
                if key in seen:
                    raise ValueError(f'FAO calendar CSV row {line} duplicates a regional crop season')
                seen.add(key)
                recommendations.append({'country_iso3':key[0],'region':row['region'].strip(),'agroecological_zone':row['agroecological_zone'].strip(),'crop':row['crop'].strip(),'season':row['season'].strip(),'planting_start_month':months['planting_start_month'],'planting_end_month':months['planting_end_month'],'harvest_start_month':months['harvest_start_month'],'harvest_end_month':months['harvest_end_month'],'source_url':source_url,'source_title':row['source_title'].strip(),'accessed_on':accessed.isoformat(),'license':row['license'].strip(),'permission_reference':row['permission_reference'].strip(),'notes':(row.get('notes') or '').strip()})
    except UnicodeDecodeError as exc:
        raise ValueError('FAO calendar CSV must be UTF-8 encoded') from exc
    return {'status':'manual','availability':'manual_imported' if recommendations else 'no_matching_field','period':'regional reference only','recommendations':recommendations,'note':"Manually supplied regional recommendations; source terms and permission references are recorded but not independently verified. Confirm region/crop suitability with a local agronomist. These windows are not the field's actual planting or harvest dates."}

HANDLERS={'worldcover':worldcover,'chirps':chirps,'soilgrids':soilgrids,'worldcereal':worldcereal,'cropharvest':cropharvest,'fao-calendar':fao_calendar}
def run(field, options, handlers=None):
    results=[]
    for provider in options.get('providers',PROVIDERS):
        source,version,url,license_=SOURCES[provider]
        entry={'provider':provider,'source':source,'version':version,'source_url':url,'license':license_,'fetched_at':datetime.now(timezone.utc).isoformat()}
        try:
            payload=(handlers or HANDLERS)[provider](field,options)
            status=payload.pop('status','downloaded')
            entry.update(status=status,payload=payload)
            if provider=='fao-calendar' and payload.get('is_demo'):
                entry.update(source='TerraScope Indian calendar — DEMO, not FAO data',version='demo-1',license='CC0-1.0 (synthetic fixtures)',source_url='https://github.com/tusharsingh-1801/91-CHM/tree/main/datasets/calendar')
            if payload.get('coverage_percent')==0:
                entry.update(status='blocked',availability='unavailable',error='No valid source coverage for requested field/interval')
        except Unavailable as exc:
            entry.update(status='blocked',availability='unavailable',error=str(exc),attempted_url=exc.url,http_status=exc.http_status)
        except Exception as exc:
            entry.update(status='failed',availability='unavailable',error=f'{type(exc).__name__}: {exc}')
        results.append(entry)
    return results

if __name__=='__main__':
    request=json.load(sys.stdin)
    print(json.dumps(run(request['field'],request['options']),allow_nan=False))
