import pytest
from fastapi import HTTPException
from shapely.geometry import box, mapping

from backend.engine import earth_engine as gee
from backend.engine.main import app
from fastapi.testclient import TestClient

POLYGON = mapping(box(77, 28, 77.001, 28.001))


def test_geometry_requires_bounded_valid_wgs84_polygon():
    geometry, area = gee._geometry(POLYGON)
    assert geometry.geom_type == 'Polygon'
    assert 0 < area < 100_000_000
    with pytest.raises(HTTPException, match='WGS84 Polygon'):
        gee._geometry({'type': 'MultiPolygon', 'coordinates': []})
    with pytest.raises(HTTPException, match='WGS84 Polygon'):
        gee._geometry(mapping(box(0, 0, 2, 2)))


def test_scene_ids_are_limited_to_the_sentinel_collection():
    assert gee._image_id('COPERNICUS/S2_SR_HARMONIZED/20261001T000000_T43QAB') == 'COPERNICUS/S2_SR_HARMONIZED/20261001T000000_T43QAB'
    with pytest.raises(HTTPException, match='Invalid Earth Engine Sentinel-2 image ID'):
        gee._image_id('users/someone/private-asset')


def test_project_must_be_configured_for_server_auth(monkeypatch):
    monkeypatch.delenv('EARTH_ENGINE_PROJECT_ID', raising=False)
    with pytest.raises(HTTPException, match='EARTH_ENGINE_PROJECT_ID'):
        gee._project()
    monkeypatch.setenv('EARTH_ENGINE_PROJECT_ID', 'meta-falcon-512307-n4')
    assert gee._project() == 'meta-falcon-512307-n4'


def test_search_uses_earth_engine_collection_and_returns_dated_metadata(monkeypatch):
    calls = {}

    class Collection:
        def filterBounds(self, region):
            calls['region'] = region
            return self

        def filterDate(self, start, end):
            calls['dates'] = (start, end)
            return self

        def filter(self, condition):
            calls['filter'] = condition
            return self

        def sort(self, key, descending):
            calls['sort'] = (key, descending)
            return self

        def limit(self, value):
            calls['limit'] = value
            return self

        def aggregate_array(self, key):
            return key

    class FakeEE:
        @staticmethod
        def Geometry(geometry):
            return geometry

        @staticmethod
        def ImageCollection(collection_id):
            calls['collection'] = collection_id
            return Collection()

        class Filter:
            @staticmethod
            def lt(key, value):
                return key, value

        class Dictionary:
            def __init__(self, values):
                self.values = values

            def getInfo(self):
                return {
                    'ids': ['20261001T000000_T43QAB'],
                    'times': [1790812800000],
                    'clouds': [5.0],
                }

    monkeypatch.setattr(gee, '_ee', lambda: FakeEE)
    scenes = gee.search_scenes(POLYGON, '2026-09-01', '2026-10-29', 10)
    assert calls['collection'] == 'COPERNICUS/S2_SR_HARMONIZED'
    assert calls['dates'] == ('2026-09-01', '2026-10-29')
    assert calls['filter'] == ('CLOUDY_PIXEL_PERCENTAGE', 40)
    assert calls['sort'] == ('system:time_start', False)
    assert calls['limit'] == 10
    assert scenes[0]['image_id'] == 'COPERNICUS/S2_SR_HARMONIZED/20261001T000000_T43QAB'
    assert scenes[0]['cloud_cover'] == 5.0
    assert scenes[0]['observed_at'].startswith('2026-10-01T')


def test_tile_coordinates_are_bounded_before_earth_engine_calls(monkeypatch):
    monkeypatch.setattr(gee, '_ee', lambda: pytest.fail('invalid tile must not initialize Earth Engine'))
    with pytest.raises(HTTPException, match='Invalid map tile'):
        gee.get_tile('COPERNICUS/S2_SR_HARMONIZED/20261001T000000_T43QAB', POLYGON, 3, 8, 0)


def test_earth_engine_scene_api_validates_and_returns_dated_results(monkeypatch):
    monkeypatch.setattr(gee, 'search_scenes', lambda polygon, start, end, limit: [{
        'id': '20261001T000000_T43QAB',
        'image_id': 'COPERNICUS/S2_SR_HARMONIZED/20261001T000000_T43QAB',
        'observed_at': '2026-10-01T00:00:00+00:00',
        'cloud_cover': 5.0,
    }])
    client = TestClient(app)
    response = client.post('/earth-engine/scenes', json={
        'polygonGeojson': POLYGON,
        'start': '2026-09-01',
        'end': '2026-10-29',
        'limit': 10,
    })
    assert response.status_code == 200
    assert response.json()['scenes'][0]['cloud_cover'] == 5.0
    invalid = client.post('/earth-engine/scenes', json={
        'polygonGeojson': POLYGON,
        'start': '2026-09-01',
        'end': '2026-10-29',
        'limit': 21,
    })
    assert invalid.status_code == 422


def test_index_reduction_returns_pixel_coverage_and_preserves_index_shape(monkeypatch):
    class FakeResult:
        def __init__(self, value):
            self.value = value

        def getInfo(self):
            return self.value

    class FakeImage:
        def __init__(self, name=''):
            self.name = name

        def __getattr__(self, _name):
            return lambda *args, **kwargs: self

        def select(self, names):
            return FakeImage(names if isinstance(names, str) else 'reflectance')

        def rename(self, name):
            self.name = name
            return self

        def reduceRegion(self, **_kwargs):
            if self.name == 'pixels':
                return FakeResult({'pixels': 1000})
            return FakeResult({
                'ndvi_mean': 0.6, 'ndvi_min': 0.2, 'ndvi_max': 0.9,
                'ndvi_median': 0.61, 'ndvi_stdDev': 0.1, 'ndvi_count': 800,
                'ndre_mean': 0.4, 'ndmi_mean': 0.3, 'savi_mean': 0.5, 'evi_mean': 0.7,
            })

    class FakeReducer:
        def combine(self, **_kwargs):
            return self

    class FakeEE:
        Image = type('ImageFactory', (), {'__new__': lambda _cls, *_args: FakeImage(), 'cat': staticmethod(lambda _images: FakeImage())})
        Geometry = staticmethod(lambda _geometry: FakeImage())
        Reducer = type('ReducerFactory', (), {
            'mean': staticmethod(FakeReducer),
            'min': staticmethod(FakeReducer),
            'max': staticmethod(FakeReducer),
            'median': staticmethod(FakeReducer),
            'stdDev': staticmethod(FakeReducer),
            'count': staticmethod(FakeReducer),
        })

    monkeypatch.setattr(gee, '_ee', lambda: FakeEE)
    result = gee.calculate_indices('COPERNICUS/S2_SR_HARMONIZED/20261001T000000_T43QAB', POLYGON)
    assert result['ndvi'] == 0.6
    assert result['validPixels'] == 800
    assert result['validCoverage'] == 80
    assert result['calculationVersion'] == 'gee-sentinel-reflectance-scl-v1'


def test_worldcereal_summary_uses_official_annual_collection_and_field_area(monkeypatch):
    _, field_area = gee._geometry(POLYGON)

    class FakeResult:
        def __init__(self, value):
            self.value = value

        def getInfo(self):
            return self.value

    class FakeImage:
        def __init__(self, name=''):
            self.name = name

        def __getattr__(self, _name):
            return lambda *args, **kwargs: self

        def select(self, name):
            return FakeImage(name)

        def updateMask(self, _mask):
            return self

        def rename(self, name):
            return FakeImage(name)

        def multiply(self, _other):
            return self

        def eq(self, _value):
            return self

        def reduceRegion(self, **kwargs):
            assert kwargs['scale'] == 10
            return FakeResult({
                'mapped_area_m2': field_area * 0.8,
                'temporary_crop_area_m2': field_area * 0.3,
                'confidence_area': field_area * 0.8 * 70,
            })

    class FakeList:
        def distinct(self):
            return self

        def getInfo(self):
            return [25147, 34119]

    class FakeCollection:
        def filterBounds(self, _region):
            return self

        def filter(self, _condition):
            return self

        def size(self):
            return FakeResult(2)

        def mosaic(self):
            return FakeImage()

        def aggregate_array(self, key):
            assert key == 'aez_id'
            return FakeList()

    class FakeEE:
        Image = type('ImageFactory', (), {
            'pixelArea': staticmethod(lambda: FakeImage()),
            'cat': staticmethod(lambda _images: FakeImage('summary')),
        })
        Geometry = staticmethod(lambda _geometry: _geometry)
        ImageCollection = staticmethod(lambda collection_id: (
            FakeCollection() if collection_id == gee.WORLDCEREAL_MODELS
            else pytest.fail(f'Unexpected WorldCereal collection: {collection_id}')
        ))
        Filter = type('FilterFactory', (), {'eq': staticmethod(lambda key, value: (key, value))})
        Reducer = type('ReducerFactory', (), {'sum': staticmethod(lambda: object())})

    monkeypatch.setattr(gee, '_ee', lambda: FakeEE)
    result = gee.summarize_worldcereal(POLYGON)
    assert result['coverage_percent'] == 80
    assert result['temporary_crop_percent_field'] == 30
    assert result['temporary_crop_percent_mapped'] == 37.5
    assert result['mean_confidence'] == 70
    assert result['aez_ids'] == [25147, 34119]
    assert result['image_count'] == 2
    assert 'not current crop identity' in result['note']
