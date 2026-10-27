import base64
from datetime import datetime, timezone
import json
import logging
import os
import re
import threading
import time
from urllib.request import urlopen

from fastapi import HTTPException
from shapely.geometry import mapping, shape
from shapely.ops import transform
from pyproj import Transformer

logger = logging.getLogger(__name__)
COLLECTION = 'COPERNICUS/S2_SR_HARMONIZED'
WORLDCEREAL_MODELS = 'ESA/WorldCereal/2021/MODELS/v100'
INVALID_SCL = (0, 1, 2, 3, 8, 9, 10, 11)
MAX_PIXELS = 4_000_000
MAX_AREA_M2 = 100_000_000
MAX_TILE_BYTES = 8 * 1024 * 1024
_map_cache = {}
_initialized_project = None
_ee_module = None
_initialization_lock = threading.Lock()


def _project():
    project = os.environ.get('EARTH_ENGINE_PROJECT_ID', '').strip()
    if not re.fullmatch(r'[a-z][a-z0-9-]{4,28}[a-z0-9]', project):
        raise HTTPException(503, 'Set a valid EARTH_ENGINE_PROJECT_ID and configure Google Application Default Credentials.')
    return project


def _ee():
    global _initialized_project, _ee_module
    project = _project()
    if _ee_module is not None and _initialized_project == project:
        return _ee_module
    with _initialization_lock:
        if _ee_module is not None and _initialized_project == project:
            return _ee_module
        try:
            import ee
        except ImportError as exc:
            raise HTTPException(503, 'Earth Engine API is not installed. Restore backend/engine/requirements.txt.') from exc
        try:
            ee.Initialize(project=project)
        except Exception as exc:
            logger.warning('Earth Engine initialization failed: %s', type(exc).__name__)
            raise HTTPException(503, 'Earth Engine authentication failed. Configure ADC and confirm this project is registered for Earth Engine.') from exc
        _initialized_project = project
        _ee_module = ee
        return ee


def _geometry(geojson):
    try:
        geometry = shape(geojson)
        if geometry.geom_type != 'Polygon' or geometry.is_empty or not geometry.is_valid:
            raise ValueError('invalid polygon')
        west, south, east, north = geometry.bounds
        if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
            raise ValueError('invalid bounds')
        area = transform(Transformer.from_crs(4326, 6933, always_xy=True).transform, geometry).area
        if area <= 0 or area > MAX_AREA_M2:
            raise ValueError('unsupported area')
        return geometry, area
    except Exception as exc:
        raise HTTPException(422, 'A valid WGS84 Polygon under 100 square kilometres is required.') from exc


def _image_id(value):
    if not isinstance(value, str) or not re.fullmatch(rf'{re.escape(COLLECTION)}/[A-Za-z0-9_-]+', value):
        raise HTTPException(422, 'Invalid Earth Engine Sentinel-2 image ID.')
    return value


def _ndvi_image(ee, image_id, geojson):
    region, _ = _geometry(geojson)
    geometry = ee.Geometry(mapping(region))
    image = ee.Image(_image_id(image_id))
    scl = image.select('SCL')
    mask = scl.mask()
    for class_id in INVALID_SCL:
        mask = mask.And(scl.neq(class_id))
    reflectance = image.select(['B2', 'B4', 'B5', 'B8', 'B8A', 'B11']).multiply(0.0001)
    nir = reflectance.select('B8')
    red = reflectance.select('B4')
    ndvi_denominator = nir.add(red)
    ndvi = nir.subtract(red).divide(ndvi_denominator).updateMask(ndvi_denominator.neq(0)).rename('ndvi')
    valid = mask.And(red.mask()).And(nir.mask()).And(ndvi.mask())
    ndvi = ndvi.updateMask(valid).clip(geometry)
    return geometry, image, reflectance, valid, ndvi


def search_scenes(geojson, start, end, limit):
    if not isinstance(limit, int) or not 1 <= limit <= 20:
        raise HTTPException(422, 'Scene limit must be between 1 and 20.')
    _geometry(geojson)
    ee = _ee()
    try:
        region = ee.Geometry(geojson)
        collection = (ee.ImageCollection(COLLECTION)
                      .filterBounds(region)
                      .filterDate(start, end)
                      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
                      .sort('system:time_start', False)
                      .limit(limit))
        properties = ee.Dictionary({
            'ids': collection.aggregate_array('system:index'),
            'times': collection.aggregate_array('system:time_start'),
            'clouds': collection.aggregate_array('CLOUDY_PIXEL_PERCENTAGE'),
        }).getInfo()
        scenes = []
        for index, milliseconds, cloud_cover in zip(properties['ids'], properties['times'], properties['clouds']):
            image_id = f'{COLLECTION}/{index}'
            if not re.fullmatch(rf'{re.escape(COLLECTION)}/[A-Za-z0-9_-]+', image_id):
                continue
            observed_at = datetime.fromtimestamp(milliseconds / 1000, tz=timezone.utc).isoformat()
            scenes.append({
                'id': index,
                'image_id': image_id,
                'observed_at': observed_at,
                'cloud_cover': cloud_cover,
            })
        return scenes
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('Earth Engine scene search failed: %s', type(exc).__name__)
        raise HTTPException(502, 'Google Earth Engine could not search Sentinel-2 scenes for this field.') from exc


def calculate_indices(image_id, geojson):
    geometry, _ = _geometry(geojson)
    ee = _ee()
    try:
        region, image, reflectance, valid, ndvi = _ndvi_image(ee, image_id, geojson)
        red = reflectance.select('B4')
        nir = reflectance.select('B8')
        blue = reflectance.select('B2')
        red_edge = reflectance.select('B5')
        swir = reflectance.select('B11')
        ndre_denominator = nir.add(red_edge)
        ndmi_denominator = nir.add(swir)
        ndre = nir.subtract(red_edge).divide(ndre_denominator).updateMask(valid.And(ndre_denominator.neq(0))).rename('ndre')
        ndmi = nir.subtract(swir).divide(ndmi_denominator).updateMask(valid.And(ndmi_denominator.neq(0))).rename('ndmi')
        savi = nir.subtract(red).multiply(1.5).divide(nir.add(red).add(0.5)).rename('savi').updateMask(valid)
        evi_denominator = nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1)
        evi = nir.subtract(red).multiply(2.5).divide(evi_denominator).rename('evi').updateMask(valid.And(evi_denominator.neq(0)))
        indices = ee.Image.cat([ndvi, ndre, ndmi, savi, evi])
        reducer = ee.Reducer.mean()
        for next_reducer in (ee.Reducer.min(), ee.Reducer.max(), ee.Reducer.median(), ee.Reducer.stdDev(), ee.Reducer.count()):
            reducer = reducer.combine(reducer2=next_reducer, sharedInputs=True)
        stats = indices.reduceRegion(reducer=reducer, geometry=region, scale=10, maxPixels=MAX_PIXELS, tileScale=4).getInfo()
        total_image = image.select('B4').multiply(0).unmask(1, sameFootprint=False).rename('pixels').clip(region)
        total = total_image.reduceRegion(
            reducer=ee.Reducer.count(), geometry=region, scale=10, maxPixels=MAX_PIXELS, tileScale=4
        ).getInfo().get('pixels')
        valid_pixels = int(stats.get('ndvi_count') or 0)
        if valid_pixels < 1 or not total:
            raise HTTPException(422, 'No clear Sentinel-2 pixels intersect this field.')

        def metric(name, statistic):
            value = stats.get(f'{name}_{statistic}')
            return round(float(value), 4) if value is not None else None

        return {
            'ndvi': metric('ndvi', 'mean'),
            'ndre': metric('ndre', 'mean'),
            'ndmi': metric('ndmi', 'mean'),
            'savi': metric('savi', 'mean'),
            'evi': metric('evi', 'mean'),
            'validPixels': valid_pixels,
            'validCoverage': round(min(100, valid_pixels / total * 100), 2),
            'minimum': metric('ndvi', 'min'),
            'maximum': metric('ndvi', 'max'),
            'median': metric('ndvi', 'median'),
            'standardDeviation': metric('ndvi', 'stdDev'),
            'stressGeojson': None,
            'affectedCoverage': None,
            'calculationVersion': 'gee-sentinel-reflectance-scl-v1',
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('Earth Engine index calculation failed: %s', type(exc).__name__)
        raise HTTPException(502, 'Google Earth Engine could not calculate field indices.') from exc


def summarize_worldcereal(geojson):
    geometry, field_area = _geometry(geojson)
    ee = _ee()
    try:
        region = ee.Geometry(mapping(geometry))
        collection = (ee.ImageCollection(WORLDCEREAL_MODELS)
                      .filterBounds(region)
                      .filter(ee.Filter.eq('product', 'temporarycrops'))
                      .filter(ee.Filter.eq('season', 'tc-annual')))
        image_count = collection.size().getInfo()
        if not image_count:
            raise HTTPException(422, 'No WorldCereal 2021 annual temporary-crop map intersects this field.')

        image = collection.mosaic()
        classification = image.select('classification')
        mapped = classification.mask()
        pixel_area = ee.Image.pixelArea()
        summary = ee.Image.cat([
            pixel_area.updateMask(mapped).rename('mapped_area_m2'),
            pixel_area.updateMask(classification.eq(100)).rename('temporary_crop_area_m2'),
            image.select('confidence').updateMask(mapped).multiply(pixel_area).rename('confidence_area'),
        ]).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=region, scale=10,
            maxPixels=MAX_PIXELS, tileScale=4,
        ).getInfo()
        mapped_area = float(summary.get('mapped_area_m2') or 0)
        temporary_crop_area = float(summary.get('temporary_crop_area_m2') or 0)
        confidence_area = float(summary.get('confidence_area') or 0)
        if mapped_area <= 0 or temporary_crop_area < 0 or temporary_crop_area > mapped_area:
            raise HTTPException(422, 'WorldCereal has no valid mapped pixels for this field.')
        aez_ids = collection.aggregate_array('aez_id').distinct().getInfo()
        return {
            'period': '2021 annual product',
            'product': 'temporarycrops',
            'season': 'tc-annual',
            'resolution': '10 m',
            'coverage_percent': round(min(100, mapped_area / field_area * 100), 2),
            'temporary_crop_percent_field': round(min(100, temporary_crop_area / field_area * 100), 2),
            'temporary_crop_percent_mapped': round(min(100, temporary_crop_area / mapped_area * 100), 2),
            'mean_confidence': round(confidence_area / mapped_area, 2),
            'aez_ids': sorted({int(value) for value in aez_ids}),
            'image_count': int(image_count),
            'source_urls': [
                'https://developers.google.com/earth-engine/datasets/catalog/ESA_WorldCereal_2021_MODELS_v100',
                'https://esa-worldcereal.org/en/products/global-maps',
            ],
            'note': 'Historical 2021 temporary-crop classification; not current crop identity. Regional AEZ images are mosaicked as documented by ESA.',
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('WorldCereal Earth Engine summary failed: %s', type(exc).__name__)
        raise HTTPException(502, 'Google Earth Engine could not summarize the WorldCereal map for this field.') from exc


def _map_id(image_id, geojson):
    ee = _ee()
    now = time.monotonic()
    key = (image_id, json.dumps(geojson, sort_keys=True, separators=(',', ':')))
    cached = _map_cache.get(key)
    if cached and cached[0] > now:
        return cached[1]
    _, _, _, _, ndvi = _ndvi_image(ee, image_id, geojson)
    map_id = ndvi.getMapId({'min': -0.2, 'max': 1, 'palette': ['a50026', 'ffffbf', '006837']})
    if len(_map_cache) >= 100:
        _map_cache.clear()
    _map_cache[key] = (now + 45 * 60, map_id)
    return map_id


def _tile_url(ee, map_id, x, y, z):
    try:
        return ee.data.getTileUrl(map_id, x, y, z)
    except (AttributeError, TypeError):
        fetcher = map_id.get('tile_fetcher')
        template = getattr(fetcher, 'url_format', None)
        if template:
            return template.format(x=x, y=y, z=z)
        map_name, token = map_id.get('mapid'), map_id.get('token')
        if map_name and token:
            return f'https://earthengine.googleapis.com/map/{map_name}/{z}/{x}/{y}?token={token}'
        raise


def get_tile(image_id, geojson, z, x, y):
    if not (0 <= z <= 20 and 0 <= x < 2 ** z and 0 <= y < 2 ** z):
        raise HTTPException(422, 'Invalid map tile.')
    ee = _ee()
    try:
        url = _tile_url(ee, _map_id(image_id, geojson), x, y, z)
        with urlopen(url, timeout=20) as response:
            content = response.read(MAX_TILE_BYTES + 1)
            if len(content) > MAX_TILE_BYTES or not content.startswith(b'\x89PNG\r\n\x1a\n'):
                raise HTTPException(502, 'Earth Engine returned an invalid or oversized map tile.')
            return content
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('Earth Engine tile request failed: %s', type(exc).__name__)
        raise HTTPException(502, 'Google Earth Engine could not render this Sentinel-2 tile.') from exc


def generate_overlay(image_id, geojson):
    geometry, _ = _geometry(geojson)
    ee = _ee()
    try:
        region, _, _, _, ndvi = _ndvi_image(ee, image_id, geojson)
        url = ndvi.visualize(min=-0.2, max=1, palette=['a50026', 'ffffbf', '006837']).getThumbURL({
            'region': region, 'dimensions': 1024, 'format': 'png',
        })
        with urlopen(url, timeout=30) as response:
            content = response.read(8 * 1024 * 1024 + 1)
            if len(content) > 8 * 1024 * 1024 or not content.startswith(b'\x89PNG\r\n\x1a\n'):
                raise HTTPException(502, 'Earth Engine returned an invalid or oversized overlay.')
        west, south, east, north = geometry.bounds
        return {
            'image': 'data:image/png;base64,' + base64.b64encode(content).decode('ascii'),
            'bounds': {'north': north, 'south': south, 'east': east, 'west': west},
            'calculationVersion': 'gee-sentinel-reflectance-scl-v1',
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning('Earth Engine overlay request failed: %s', type(exc).__name__)
        raise HTTPException(502, 'Google Earth Engine could not render this Sentinel-2 overlay.') from exc
