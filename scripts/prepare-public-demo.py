"""Extract a small, unmodified public India parcel research sample."""
import argparse
import hashlib
import json
from pathlib import Path
import pyarrow.parquet as pq
from pyproj import CRS, Geod, Transformer
from shapely import wkb
from shapely.geometry import mapping
from shapely.ops import transform

parser = argparse.ArgumentParser()
parser.add_argument('--input', default='.local/datasets/boundaries_india_2016.parquet')
args = parser.parse_args()
path = Path(args.input)
table = pq.read_table(path)
meta = json.loads(table.schema.metadata[b'geo'])
column = meta['primary_column']
crs = CRS.from_user_input(meta['columns'][column].get('crs') or 'OGC:CRS84')
to_wgs84 = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True)
geod = Geod(ellps='WGS84')
candidates = []
for row in table.to_pylist():
    geom = wkb.loads(row[column])
    if crs.to_epsg() != 4326:
        geom = transform(to_wgs84.transform, geom)
    if geom.geom_type != 'Polygon' or geom.is_empty or not geom.is_valid:
        continue
    hectares = abs(geod.geometry_area_perimeter(geom)[0]) / 10000
    point = geom.representative_point()
    if 1 <= hectares <= 10 and 68 <= point.x <= 98 and 6 <= point.y <= 38:
        candidates.append((row, geom, hectares, point))
features = []
used = set()
# Geographic diversity for the sample, not presumed crop labels or user farm locations.
for lat, lon in [(29, 76), (22, 78), (17, 78)]:
    available = [item for item in candidates if str(item[0]['id']) not in used]
    row, geom, hectares, point = min(available, key=lambda item: (item[3].y-lat)**2+(item[3].x-lon)**2)
    source_id = str(row['id'])
    used.add(source_id)
    features.append({'type': 'Feature', 'geometry': mapping(geom), 'properties': {
        'source_id': source_id, 'name': f'Research sample: India parcel {source_id}',
        'dataset': 'Fields of the World — India', 'boundary_year': 2016,
        'determination_datetime': str(row.get('determination_datetime')),
        'area_hectares': round(hectares, 4), 'latitude': point.y, 'longitude': point.x,
        'crop': None, 'planting_date': None, 'harvest_date': None, 'expected_yield_tons': None,
        'license': 'CC BY 4.0',
        'source_url': 'https://source.coop/kerner-lab/fields-of-the-world-india/boundaries_india_2016.parquet',
        'warning': 'Historical public benchmark boundary; not a user farm. Current crop and management dates are unverified.'
    }})
output = Path('datasets/demo')
output.mkdir(parents=True, exist_ok=True)
(output/'ftw-india-sample.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, indent=2)+'\n')
(output/'manifest.json').write_text(json.dumps({
    'source_url': features[0]['properties']['source_url'], 'source_rows': table.num_rows,
    'source_file_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
    'source_file_bytes': path.stat().st_size, 'sample_count': len(features),
    'selection': 'Valid 1–10 ha source polygons nearest (29,76), (22,78), (17,78), without changing polygon coordinates.',
    'license': 'CC BY 4.0', 'status': 'Historical research sample, not user field ground truth',
}, indent=2)+'\n')
for feature in features:
    p = feature['properties']
    print(p['name'], p['area_hectares'], p['latitude'], p['longitude'])
print(f'Prepared {len(features)} public parcels from {table.num_rows} source rows.')
