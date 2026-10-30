import base64
import io

import pytest
from fastapi import HTTPException
from PIL import Image
from fastapi.testclient import TestClient

from backend.engine import potato_inference
from backend.engine.main import app


def encoded_photo():
    output = io.BytesIO()
    Image.new("RGB", (64, 64), color=(40, 120, 45)).save(output, format="JPEG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def test_metadata_marks_the_feature_experimental_and_distinct_from_satellite_data():
    metadata = potato_inference.potato_research_metadata()
    assert metadata["dataset_id"] == "pldd-up-potato-leaf-disease"
    assert metadata["image_count"] == 15519
    assert metadata["model_available"] is potato_inference.MODEL_PATH.is_file()
    assert len(metadata["classes"]) == 3
    assert any("satellite" in limitation.lower() for limitation in metadata["limitations"])


def test_http_metadata_endpoint_is_available_and_does_not_claim_a_trained_model():
    response = TestClient(app).get("/research/potato-leaf")
    assert response.status_code == 200
    assert response.json()["dataset_id"] == "pldd-up-potato-leaf-disease"
    assert "model_available" in response.json()


def test_prediction_without_a_trained_model_returns_unavailable(monkeypatch, tmp_path):
    monkeypatch.setattr(potato_inference, "MODEL_PATH", tmp_path / "missing.pth")
    potato_inference._load_model.cache_clear()
    with pytest.raises(HTTPException) as caught:
        potato_inference.predict_potato_leaf(potato_inference.PotatoPredictionRequest(image=encoded_photo()))
    assert caught.value.status_code == 503
    assert "not trained" in caught.value.detail


def test_http_prediction_endpoint_returns_503_without_a_checkpoint(monkeypatch, tmp_path):
    monkeypatch.setattr(potato_inference, "MODEL_PATH", tmp_path / "missing.pth")
    potato_inference._load_model.cache_clear()
    response = TestClient(app).post(
        "/research/potato-leaf/predict",
        json={"image": encoded_photo()},
    )
    assert response.status_code == 503
    assert "not trained" in response.json()["detail"]


def test_prediction_rejects_bad_base64(monkeypatch, tmp_path):
    monkeypatch.setattr(potato_inference, "MODEL_PATH", tmp_path / "missing.pth")
    with pytest.raises(HTTPException) as caught:
        potato_inference.predict_potato_leaf(potato_inference.PotatoPredictionRequest(image="%%%"))
    assert caught.value.status_code == 422
