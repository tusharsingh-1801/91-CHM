import importlib.util
import io
from pathlib import Path
import re
import zipfile
import pytest

SPEC=importlib.util.spec_from_file_location('acquire_worldcereal',Path(__file__).resolve().parents[2]/'scripts/acquire-worldcereal-fields.py')
acquire=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(acquire)


def archive_bytes():
 stream=io.BytesIO()
 with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as archive:
  archive.writestr('data/48180_tc-annual_temporarycrops_2020-09-07_2021-09-07_classification.tif',b'official-test-content'*100)
 data=stream.getvalue();reader=io.BytesIO(data);reader.length=len(data)
 return data,reader,zipfile.ZipFile(io.BytesIO(data)).infolist()[0]


def test_bounded_member_validates_range_crc_and_reuses_receipt(monkeypatch,tmp_path):
 data,reader,info=archive_bytes();monkeypatch.setattr(acquire,'CACHE',tmp_path)
 calls=[]
 class Response:
  status_code=206
  def __enter__(self):return self
  def __exit__(self,*_args):pass
  def iter_content(self,_size):yield self.content
 def get(_url,**kwargs):
  calls.append(kwargs);start,end=map(int,re.fullmatch(r'bytes=(\d+)-(\d+)',kwargs['headers']['Range']).groups());r=Response();r.headers={'Content-Range':f'bytes {start}-{end}/{len(data)}'};r.content=data[start:end+1];return r
 monkeypatch.setattr(acquire.requests,'get',get)
 budget={'bytes':0};result=acquire.download_member(info,reader,budget)
 assert result.read_bytes()==b'official-test-content'*100
 assert budget['bytes']==info.compress_size
 assert acquire.download_member(info,reader,budget)==result
 assert len(calls)==1


def test_oversized_member_is_refused_before_any_download(monkeypatch,tmp_path):
 _data,reader,info=archive_bytes();info.compress_size=acquire.MAX_MEMBER+1;monkeypatch.setattr(acquire,'CACHE',tmp_path)
 monkeypatch.setattr(acquire.requests,'get',lambda *_args,**_kwargs:pytest.fail('must not download'))
 with pytest.raises(ValueError,match='bounded member transfer'):acquire.download_member(info,reader,{'bytes':0})


def test_incorrect_range_never_saves_a_member(monkeypatch,tmp_path):
 _data,reader,info=archive_bytes();monkeypatch.setattr(acquire,'CACHE',tmp_path)
 class FullResponse:
  status_code=200;headers={}
  def __enter__(self):return self
  def __exit__(self,*_args):pass
 monkeypatch.setattr(acquire.requests,'get',lambda *_args,**_kwargs:FullResponse())
 with pytest.raises(ValueError,match='Exact HTTP range'):acquire.download_member(info,reader,{'bytes':0})
 assert not list(tmp_path.rglob('*.tif'))
 assert not list(tmp_path.rglob('*.partial'))

def test_interrupted_member_resumes_only_missing_validated_chunk(monkeypatch,tmp_path):
 stream=io.BytesIO();payload=b'a'*(8*1024*1024+50)
 with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_STORED) as archive:
  archive.writestr('data/48180_tc-annual_temporarycrops_2020-09-07_2021-09-07_classification.tif',payload)
 data=stream.getvalue();reader=io.BytesIO(data);reader.length=len(data);info=zipfile.ZipFile(io.BytesIO(data)).infolist()[0]
 monkeypatch.setattr(acquire,'CACHE',tmp_path);fail=[True];calls=[]
 data_start=info.header_offset+30+len(info.filename.encode())
 class Response:
  status_code=206
  def __enter__(self):return self
  def __exit__(self,*_args):pass
  def iter_content(self,_size):yield self.content
 def get(_url,**kwargs):
  start,end=map(int,re.fullmatch(r'bytes=(\d+)-(\d+)',kwargs['headers']['Range']).groups());calls.append(start)
  if fail[0] and start>=data_start+8*1024*1024:raise acquire.requests.ConnectionError('interrupted')
  response=Response();response.headers={'Content-Range':f'bytes {start}-{end}/{len(data)}'};response.content=data[start:end+1];return response
 monkeypatch.setattr(acquire.requests,'get',get)
 with pytest.raises(acquire.requests.ConnectionError):acquire.download_member(info,reader,{'bytes':0})
 assert next(tmp_path.rglob('*.zip-part')).stat().st_size==8*1024*1024
 fail[0]=False;calls.clear()
 assert acquire.download_member(info,reader,{'bytes':0}).read_bytes()==payload
 assert calls==[data_start+8*1024*1024]
