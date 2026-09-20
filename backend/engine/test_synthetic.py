import pytest
import numpy as np
import rasterio
from rasterio.transform import from_origin
import io
import os
import math
from fastapi.testclient import TestClient
from backend.engine.main import app

client = TestClient(app)

def create_synthetic_geotiff(filename, band_data, pixel_size=0.0001):
    transform = from_origin(77.2, 28.6, pixel_size, pixel_size)
    with rasterio.open(
        filename,
        'w',
        driver='GTiff',
        height=band_data.shape[0],
        width=band_data.shape[1],
        count=1,
        dtype=band_data.dtype,
        crs='EPSG:4326',
        transform=transform,
    ) as dst:
        dst.write(band_data, 1)

@pytest.fixture
def synthetic_urls(tmp_path):
    # Create red band (values 0.1 to 0.5)
    red_data = np.full((256, 256), 0.2, dtype=np.float32)
    red_path = os.path.join(tmp_path, "red.tif")
    create_synthetic_geotiff(red_path, red_data)

    # Create nir band (values 0.5 to 0.9) - Should yield high NDVI
    nir_data = np.full((256, 256), 0.8, dtype=np.float32)
    nir_path = os.path.join(tmp_path, "nir.tif")
    create_synthetic_geotiff(nir_path, nir_data)
    
    return red_path, nir_path

def test_tile_generation_synthetic(synthetic_urls):
    red_url, nir_url = synthetic_urls
    
    payload = {
        "redUrl": red_url,
        "nirUrl": nir_url,
        "polygonGeojson": {
            "type": "Polygon",
            "coordinates": [[[77.201, 28.599], [77.209, 28.599], [77.209, 28.591], [77.201, 28.591], [77.201, 28.599]]],
        },
    }
    
    zoom = 14
    longitude, latitude = 77.205, 28.595
    scale = 2 ** zoom
    x = int((longitude + 180.0) / 360.0 * scale)
    y = int((1.0 - math.asinh(math.tan(math.radians(latitude))) / math.pi) / 2.0 * scale)
    response = client.post(f"/tiles/{zoom}/{x}/{y}.png", json=payload)
    
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    
    # Read PNG header signature
    assert response.content.startswith(b'\x89PNG\r\n\x1a\n')
    assert len(response.content) > 100


def test_calculate_indices_resamples_mismatched_bands(tmp_path):
    red_path = os.path.join(tmp_path, "red-10m.tif")
    nir_path = os.path.join(tmp_path, "nir-20m.tif")
    scl_path = os.path.join(tmp_path, "scl-20m.tif")
    create_synthetic_geotiff(red_path, np.full((100, 100), 0.2, dtype=np.float32), 0.0001)
    create_synthetic_geotiff(nir_path, np.full((50, 50), 0.8, dtype=np.float32), 0.0002)
    create_synthetic_geotiff(scl_path, np.full((50, 50), 4, dtype=np.uint8), 0.0002)

    polygon = {
        "type": "Polygon",
        "coordinates": [[[77.201, 28.599], [77.209, 28.599], [77.209, 28.591], [77.201, 28.591], [77.201, 28.599]]],
    }
    response = client.post("/calculate-indices", json={
        "redUrl": red_path,
        "nirUrl": nir_path,
        "sclUrl": scl_path,
        "polygonGeojson": polygon,
    })

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["ndvi"] == pytest.approx(0.6, abs=0.001)
    assert result["validPixels"] > 0
    assert result["validCoverage"] > 95


def test_calculate_indices_rejects_cloud_only_scene(tmp_path):
    red_path = os.path.join(tmp_path, "red.tif")
    nir_path = os.path.join(tmp_path, "nir.tif")
    scl_path = os.path.join(tmp_path, "clouds.tif")
    create_synthetic_geotiff(red_path, np.full((50, 50), 0.2, dtype=np.float32), 0.0002)
    create_synthetic_geotiff(nir_path, np.full((50, 50), 0.8, dtype=np.float32), 0.0002)
    create_synthetic_geotiff(scl_path, np.full((50, 50), 9, dtype=np.uint8), 0.0002)
    polygon = {
        "type": "Polygon",
        "coordinates": [[[77.201, 28.599], [77.209, 28.599], [77.209, 28.591], [77.201, 28.591], [77.201, 28.599]]],
    }

    response = client.post("/calculate-indices", json={
        "redUrl": red_path,
        "nirUrl": nir_path,
        "sclUrl": scl_path,
        "polygonGeojson": polygon,
    })
    assert response.status_code == 422
