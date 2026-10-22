import os
import csv
from pathlib import Path
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import box, Polygon, mapping
import reference_data as ref

def raster(tmp_path,values,nodata=0,crs='EPSG:4326',transform=None):
    path=tmp_path/'test.tif'
    values=np.array(values,dtype='uint8')
    with rasterio.open(path,'w',driver='GTiff',height=values.shape[0],width=values.shape[1],count=1,dtype='uint8',crs=crs,transform=transform or from_origin(0,2,1,1),nodata=nodata) as dst:
        dst.write(values,1)
    return path

def test_axis_order_roundtrip():
    field=box(81,26,81.001,26.001)
    projected=ref.reproject(field,4326,32644)
    assert 499999 < projected.bounds[0] < 500001
    back=ref.reproject(projected,32644,4326)
    assert back.bounds==pytest.approx(field.bounds,abs=1e-8)

def test_fractional_clipping_and_nodata(tmp_path):
    path=raster(tmp_path,[[40,10],[0,40]])
    geom=box(.5,0,1.5,2)
    result=ref.categorical([path],geom,ref.CLASSES)
    assert result['coverage_percent']==pytest.approx(75,abs=.02)
    crop=next(x for x in result['classes'] if x['code']==40)
    assert crop['field_percent']==pytest.approx(50,abs=.02)
    assert sum(x['valid_percent'] for x in result['classes'])==pytest.approx(100)

def test_holes_are_excluded(tmp_path):
    path=raster(tmp_path,[[40,40],[40,40]])
    geom=Polygon(box(0,0,2,2).exterior.coords,[box(.25,.25,.75,.75).exterior.coords])
    result=ref.categorical([path],geom,ref.CLASSES)
    assert result['coverage_percent']==pytest.approx(100,abs=.01)
    assert result['classes'][0]['area_m2']==pytest.approx(ref.reproject(geom,4326,6933).area,rel=1e-5)

def test_projected_raster(tmp_path):
    geom=box(81,26,81.001,26.001)
    projected=ref.reproject(geom,4326,32644)
    path=raster(tmp_path,[[40,40],[40,40]],crs='EPSG:32644',transform=from_origin(projected.bounds[0]-10,projected.bounds[3]+10,100,100))
    assert ref.categorical([path],geom,ref.CLASSES)['coverage_percent']==pytest.approx(100,abs=.001)

def test_missing_is_not_zero(tmp_path):
    result=ref.categorical([raster(tmp_path,[[0,0],[0,0]])],box(0,0,2,2),ref.CLASSES)
    assert result['coverage_percent']==0 and result['classes']==[]
    monthly=ref.rainfall_summary([{'date':'2021-01-01','mm':None},{'date':'2021-01-02','mm':0}])[0]
    assert monthly['available_days']==1 and monthly['sum_available_mm']==0
    assert not monthly['complete_calendar_month']
    assert ref.rainfall_summary([{'date':'2021-01-01','mm':None}])[0]['sum_available_mm'] is None

def test_overlap_rejected(tmp_path):
    path=raster(tmp_path,[[40,40],[40,40]])
    with pytest.raises(ValueError,match='double-count'):
        ref.categorical([path,path],box(0,0,2,2),ref.CLASSES)

def test_provider_failure_isolation():
    def blocked(*_): raise ref.Unavailable('https://official.example/file','HTTP 429 Too Many Requests',429)
    result=ref.run({}, {'providers':['worldcover','fao-calendar']},{'worldcover':blocked,'fao-calendar':ref.fao_calendar})
    assert result[0]['status']=='blocked' and result[0]['http_status']==429
    assert result[1]['status']=='manual'

def test_bad_geometry():
    with pytest.raises(ValueError): ref.geometry_of({'geometry':mapping(box(-170,-80,170,80))})
    with pytest.raises(ValueError): ref.geometry_of({})

def test_worldcover_index_selects_polygon(monkeypatch,tmp_path):
    import fiona
    with fiona.open(tmp_path/'worldcover-grid.fgb','w',driver='FlatGeobuf',schema={'geometry':'Polygon','properties':{'ll_tile':'str'}},crs='EPSG:4326') as dst:
        for name,geom in [('N00E000',box(0,0,3,3)),('N00E003',box(3,0,6,3))]:
            dst.write({'geometry':mapping(geom),'properties':{'ll_tile':name}})
    monkeypatch.setattr(ref,'CACHE',tmp_path)
    called=[]
    monkeypatch.setattr(ref,'subset',lambda url,g:called.append(url) or Path('fixture'))
    monkeypatch.setattr(ref,'categorical',lambda *_:{'classes':[],'coverage_percent':0})
    ref.worldcover({'geometry':mapping(box(.1,.1,.11,.11))},{})
    assert len(called)==1 and 'N00E000_Map.tif' in called[0]

@pytest.mark.skipif(os.environ.get('REFERENCE_NETWORK')!='1',reason='opt-in official provider network test')
def test_network_worldcover():
    result=ref.worldcover({'geometry':mapping(box(81.24,26.23,81.241,26.231))},{})
    assert result['coverage_percent']>0

def test_range_reader_and_real_raster_subset(monkeypatch,tmp_path):
    import io
    source=raster(tmp_path,[[40,10],[40,10]]).read_bytes()
    requests=[]
    class Reply(io.BytesIO):
        status=206
        def __init__(self,start,end):
            end=min(end,len(source)-1)
            super().__init__(source[start:end+1])
            self.headers={'Content-Range':f'bytes {start}-{end}/{len(source)}'}
    def urlopen(req,timeout):
        start,end=map(int,req.headers['Range'].split('=')[1].split('-'))
        requests.append((start,end))
        return Reply(start,end)
    monkeypatch.setattr(ref.urllib.request,'urlopen',urlopen)
    monkeypatch.setattr(ref,'CACHE',tmp_path/'cache')
    path=ref.subset('https://official.example/test.tif',box(.25,.25,.75,.75))
    with rasterio.open(path) as src:
        assert src.width==src.height==1
        assert src.read(1)[0,0]==40
    assert requests
    before=len(requests)
    assert ref.subset('https://official.example/test.tif',box(.25,.25,.75,.75))==path
    assert len(requests)==before

def test_range_reader_rejects_global_download(monkeypatch):
    import io
    class Reply(io.BytesIO):
        status=200
        headers={}
    monkeypatch.setattr(ref.urllib.request,'urlopen',lambda *_a,**_k:Reply(b'global'))
    with pytest.raises(ref.Unavailable,match='full download refused'):
        ref.RangeReader('https://official.example/test.tif')

def test_range_reader_rejects_short_range(monkeypatch):
    import io
    class Reply(io.BytesIO):
        status=206
        headers={'Content-Range':'bytes 0-4/100'}
    monkeypatch.setattr(ref.urllib.request,'urlopen',lambda *_a,**_k:Reply(b'12345'))
    with pytest.raises(ref.Unavailable,match='Incomplete or invalid HTTP range'):
        ref.RangeReader('https://official.example/test.tif')

def test_chirps_advertised_files_and_revisions(monkeypatch,tmp_path):
    field={'geometry':mapping(box(.1,.1,.11,.11))}
    monkeypatch.setattr(ref,'chirps_files',lambda base,years:{'2021-01-01':'https://official.example/final.tif'} if 'final' in base else {'2021-01-02':'https://official.example/prelim.tif'})
    monkeypatch.setattr(ref,'subset',lambda url,g,**kwargs:tmp_path/'fixture')
    field_area=ref.reproject(box(.1,.1,.11,.11),4326,6933).area
    monkeypatch.setattr(ref,'areas',lambda *_:{0:field_area})
    result=ref.chirps(field,{'start':'2021-01-01','end':'2021-01-03'})
    assert [d['revision'] for d in result['daily']]==['final','preliminary','unavailable']
    assert [d['mm'] for d in result['daily']]==[0,0,None]
    assert result['monthly'][0]['available_days']==2
    assert result['monthly'][0]['final_days']==1 and result['monthly'][0]['preliminary_days']==1
    assert result['monthly'][0]['unavailable_days']==1
    assert result['temporal_coverage_percent']==pytest.approx(200/3)
    assert result['coverage_percent']==pytest.approx(200/3)
    assert len(result['monthly'][0]['source_urls'])==2

def test_chirps_final_404_falls_back_to_preliminary(monkeypatch,tmp_path):
    field={'geometry':mapping(box(.1,.1,.11,.11))}
    monkeypatch.setattr(ref,'chirps_files',lambda base,years:{'2021-01-01':'https://official.example/final.tif'} if 'final' in base else {'2021-01-01':'https://official.example/prelim.tif'})
    def subset(url,_geom,**_kwargs):
        if url.endswith('final.tif'):
            raise ref.Unavailable(url,'HTTP 404 Not Found',404)
        return tmp_path/'fixture'
    monkeypatch.setattr(ref,'subset',subset)
    monkeypatch.setattr(ref,'areas',lambda *_:{0:100})
    result=ref.chirps(field,{'start':'2021-01-01','end':'2021-01-01'})
    assert result['daily'][0]['revision']=='preliminary'
    assert result['daily'][0]['disaggregation']=='sat'
    assert result['daily'][0]['url'].endswith('prelim.tif')

def test_soil_units_field_area_and_uncertainty(monkeypatch,tmp_path):
    path=raster(tmp_path,[[70]],transform=from_origin(0,1,1,1))
    urls=[]
    monkeypatch.setattr(ref,'fetch',lambda url,*_:urls.append(url) or path)
    field_area=ref.reproject(box(.1,.1,.11,.11),4326,6933).area
    monkeypatch.setattr(ref,'areas',lambda *_:{70:field_area})
    result=ref.soilgrids({'geometry':mapping(box(.1,.1,.11,.11))},{})
    ph=result['variables'][0]
    assert ph['mean']==ph['Q05']==ph['Q95']==7
    assert ph['unit']=='pH' and ph['depth']=='0-5cm'
    assert result['coverage_percent']==100
    assert len(urls)==24 and all('SERVICE=WCS' in u for u in urls)
    assert any('Q0.05' in u for u in urls) and any('Q0.95' in u for u in urls)
    assert any('_uncertainty' in u for u in urls)
    assert all('SUBSETTINGCRS=http' in u and '0%2F152160' in u and 'OUTPUTCRS=' in u and 'GEOTIFF_INT16' in u for u in urls)
    assert 'not lab-tested' in result['note']

def test_soilgrids_excludes_wcs_nodata_sentinels(monkeypatch,tmp_path):
    path=raster(tmp_path,[[1]])
    monkeypatch.setattr(ref,'fetch',lambda *_args,**_kwargs:path)
    monkeypatch.setattr(ref,'areas',lambda *_args:{0:1000,32767:1000})
    with pytest.raises(ref.Unavailable,match='No valid soil predictions'):
        ref.soilgrids({'geometry':mapping(box(.1,.1,.11,.11))},{})

def test_cropharvest_validates_license_checksum_and_caches_labels(monkeypatch,tmp_path):
    import hashlib,json
    metadata_path=tmp_path/'metadata.json'
    label_bytes=json.dumps({'features':[{'type':'Feature','properties':{'index':1,'dataset':'Sample'}}]}).encode()
    labels_path=tmp_path/'labels.bin';labels_path.write_bytes(label_bytes)
    metadata={'id':10251170,'metadata':{'license':{'id':'cc-by-sa-4.0'}},'files':[{'key':'labels.geojson','size':len(label_bytes),'checksum':'md5:'+hashlib.md5(label_bytes).hexdigest(),'links':{'self':'https://zenodo.org/api/records/10251170/files/labels.geojson/content'}}]}
    metadata_path.write_text(json.dumps(metadata))
    calls=[]
    def fetch(url,limit=ref.MAX_BYTES,*_args,**_kwargs):
        calls.append((url,limit))
        return metadata_path if url.endswith('/10251170') else labels_path
    monkeypatch.setattr(ref,'fetch',fetch)
    monkeypatch.setattr(ref,'ROOT',tmp_path)
    monkeypatch.setattr(ref,'CACHE',tmp_path/'.local/datasets/reference')
    result=ref.cropharvest({}, {})
    cached=tmp_path/'.local/datasets/reference/cropharvest/labels.geojson'
    assert result['status']=='downloaded' and result['label_count']==1
    assert result['sha256']==hashlib.sha256(label_bytes).hexdigest()
    assert cached.read_bytes()==label_bytes
    assert calls[-1][1]==ref.MAX_LABEL_BYTES

def test_worldcereal_manual_export_checksum(monkeypatch,tmp_path):
    import hashlib,json
    cache=tmp_path/'worldcereal';cache.mkdir()
    path=raster(cache,[[100]],nodata=255,transform=from_origin(0,1,1,1))
    manifest={'product':'temporarycrops','version':'2021 v100','license':'CC BY 4.0','rasters':[{'file':path.name,'source_url':'https://hub.esa-worldcereal.org/export','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}]}
    (cache/'manifest.json').write_text(json.dumps(manifest))
    monkeypatch.setattr(ref,'CACHE',tmp_path)
    result=ref.worldcereal({'geometry':mapping(box(.1,.1,.11,.11))},{})
    assert result['coverage_percent']==pytest.approx(100)
    assert result['classes'][0]['code']==100
    path.write_bytes(b'altered')
    with pytest.raises(ValueError,match='checksum'):
        ref.worldcereal({'geometry':mapping(box(.1,.1,.11,.11))},{})

def test_fao_manual_import_is_field_scoped_and_keeps_provenance(tmp_path):
    field_id='00000000-0000-0000-0000-000000000001'
    path=tmp_path/'calendar.csv'
    row={'field_id':field_id,'country_iso3':'IND','region':'Test district','agroecological_zone':'Zone 1','crop':'Maize','season':'Kharif','planting_start_month':'6','planting_end_month':'7','harvest_start_month':'10','harvest_end_month':'11','source_url':'https://www.fao.org/example','source_title':'FAO regional calendar','accessed_on':'2026-01-01','license':'CC BY 4.0','permission_reference':'FAO permission ref 123','notes':'Regional guidance only'}
    with path.open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=row)
        writer.writeheader();writer.writerow(row)
        writer.writerow({**row,'field_id':'00000000-0000-0000-0000-000000000002','region':'Other field'})
    result=ref.fao_calendar({'id':field_id},{'fao_calendar_csv':str(path)})
    assert result['status']=='manual' and result['availability']=='manual_imported'
    assert len(result['recommendations'])==1
    assert result['recommendations'][0]['region']=='Test district'
    assert result['recommendations'][0]['permission_reference']=='FAO permission ref 123'
    assert "not the field's actual" in result['note']

def test_fao_manual_import_rejects_missing_permission_and_unverified_hosts(tmp_path):
    field_id='00000000-0000-0000-0000-000000000001'
    path=tmp_path/'calendar.csv'
    row={'field_id':field_id,'country_iso3':'IND','region':'Test district','agroecological_zone':'Zone 1','crop':'Maize','season':'Kharif','planting_start_month':'6','planting_end_month':'7','harvest_start_month':'10','harvest_end_month':'11','source_url':'https://example.com/calendar','source_title':'FAO regional calendar','accessed_on':'2026-01-01','license':'CC BY 4.0','permission_reference':'','notes':''}
    with path.open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=row)
        writer.writeheader();writer.writerow(row)
    with pytest.raises(ValueError,match='missing required provenance'):
        ref.fao_calendar({'id':field_id},{'fao_calendar_csv':str(path)})
    row['permission_reference']='Provided';row['source_url']='https://example.com/calendar'
    with path.open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=row)
        writer.writeheader();writer.writerow(row)
    with pytest.raises(ValueError,match='HTTPS FAO source URL'):
        ref.fao_calendar({'id':field_id},{'fao_calendar_csv':str(path)})

def test_fao_demo_fallback_is_explicit_and_does_not_set_field_dates():
    field={'id':'existing-field','planting_date':'2026-06-18'}
    result=ref.run(field,{'providers':['fao-calendar']})[0]
    assert result['payload']['is_demo'] is True
    assert len(result['payload']['recommendations'])==3
    assert 'not FAO' in result['source']
    assert field['planting_date']=='2026-06-18'


def test_worldcereal_missing_aoi_is_not_marked_integrated(monkeypatch,tmp_path):
    import hashlib,json
    folder=tmp_path/'worldcereal';folder.mkdir()
    path=raster(folder,[[100,0],[0,100]],nodata=255)
    (folder/'manifest.json').write_text(json.dumps({'product':'temporarycrops','version':'2021 v100','license':'CC BY 4.0','rasters':[{'file':path.name,'source_url':'https://zenodo.org/records/7875105','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}]}))
    monkeypatch.setattr(ref,'CACHE',tmp_path)
    result=ref.worldcereal({'geometry':mapping(box(77,17,77.001,17.001))},{})
    assert result['status']=='not_configured'
    assert result['availability']=='aoi_export_required'
