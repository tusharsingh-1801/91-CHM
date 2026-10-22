#!/usr/bin/env python3
"""Prepare a source-held-out experiment from the existing verified acquisition receipt."""
import collections
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/'.local/datasets/reference/cropharvest'
HOLDOUT=['china-crop','togo-eval','kenya','lem-brazil']
SOURCE='https://github.com/nasaharvest/cropharvest/blob/main/datasets.md'
LICENSES={'geowiki-landcover-2017':'CC BY 3.0','croplands':'LP DAAC open data terms','canada':'Open Government Licence – Canada','germany':'DL-DE-BY-2.0','ile-de-france':'Etalab Open Licence','reunion-france':'Etalab Open Licence','martinique-france':'Etalab Open Licence','kenya':'CC BY-SA 4.0','tanzania-rice-ecaas':'CC BY-SA 4.0','jecam':'CC BY-SA 4.0','zimbabwe':'CC BY-SA 4.0','china-crop':'CC BY-SA 4.0 (CropHarvest archive; separate constituent terms not specified upstream)'}

def prepare():
 receipt=json.loads((ROOT/'feature-acquisition.json').read_text())
 labels_path=ROOT/'labels.geojson'
 labels={str(f['properties']['index'])+'_'+f['properties']['dataset']:f['properties'] for f in json.loads(labels_path.read_text())['features']}
 # Held-out sources take priority when exact features or location/date keys overlap.
 ordered=sorted(receipt['samples'],key=lambda s:(labels[s['id']]['dataset'] not in HOLDOUT,s['id']))
 seen_hash=set();seen_location={};samples=[];excluded=[]
 for sample in ordered:
  label=labels[sample['id']];is_test=label['dataset'] in HOLDOUT
  location=(label.get('lat'),label.get('lon'),label.get('export_end_date'))
  reason=None
  if sample['sha256'] in seen_hash:reason='duplicate_feature_checksum'
  elif label.get('is_test') and not is_test:reason='official_test_reserved'
  elif location[0] is not None and location[1] is not None and location in seen_location and seen_location[location]!=is_test:reason='location_date_overlap_with_holdout'
  if reason:excluded.append({'id':sample['id'],'reason':reason});continue
  samples.append(sample);seen_hash.add(sample['sha256'])
  if location[0] is not None and location[1] is not None:seen_location[location]=is_test
 sources=sorted({labels[s['id']]['dataset'] for s in samples})
 manifest={'record':'10251170','license':'CC BY-SA 4.0','labels':{'file':'labels.geojson','sha256':hashlib.sha256(labels_path.read_bytes()).hexdigest()},'held_out_datasets':HOLDOUT,'constituent_licenses':{name:{'license':LICENSES.get(name,'CC BY 4.0'),'source_url':SOURCE,'archive_url':'https://zenodo.org/records/10251170'} for name in sources},'samples':samples,'input_sample_count':len(receipt['samples']),'excluded_samples':excluded,'split_policy':'Preselected held-out sources, all official test samples kept out of training; duplicate feature and cross-split location/date overlap excluded. No hyperparameter tuning on test set.'}
 (ROOT/'training-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'input_samples':len(receipt['samples']),'eligible_samples':len(samples),'excluded':dict(collections.Counter(x['reason'] for x in excluded)),'held_out_datasets':HOLDOUT},indent=2))
if __name__=='__main__':prepare()
