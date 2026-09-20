import pytest
import numpy as np
import rasterio
from rasterio.transform import from_origin
import io
import os
from fastapi.testclient import TestClient
from backend.engine.main import app

client = TestClient(app)

def create_synthetic_geotiff(filename, band_data):
    transform = from_origin(77.2, 28.6, 0.0001, 0.0001)
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
        "nirUrl": nir_url
    }
    
    # Request a tile at z=14, x=11634, y=6843 (approx Delhi area where we set origin)
    # Even if tile doesn't overlap exactly, rio-tiler will handle it
    response = client.post("/tiles/14/11634/6843.png", json=payload)
    
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    
    # Read PNG header signature
    assert response.content.startswith(b'\x89PNG\r\n\x1a\n')
