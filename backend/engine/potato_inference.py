import base64
import io
import pickle
from functools import lru_cache
from pathlib import Path

import torch
from fastapi import APIRouter, HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from torch import nn
from torchvision import models, transforms


router = APIRouter()
ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / ".local" / "models" / "pldd-up" / "model.pth"
DATASET_ID = "pldd-up-potato-leaf-disease"
CLASSES = ["Healthy", "Early Blight", "Late Blight"]
LIMITATIONS = [
    "Field-collected leaf photographs, not satellite observations or satellite-matched field labels.",
    "Not a validated commercial diagnostic and not representative of all Uttar Pradesh districts or potato varieties.",
    "Model probabilities are experimental scores, not diagnostic confidence.",
]
MAX_IMAGE_BYTES = 5 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000


class PotatoPredictionRequest(BaseModel):
    image: str


@router.get("/research/potato-leaf")
def potato_research_metadata():
    return {
        "dataset_id": DATASET_ID,
        "name": "PLDD-UP: Potato Leaf Disease Dataset from Uttar Pradesh, India",
        "doi": "10.17632/3j4nfkvp2n.1",
        "source_url": "https://data.mendeley.com/datasets/3j4nfkvp2n/1",
        "license": "CC BY 4.0",
        "crop": "potato",
        "classes": [
            {"label": "Healthy", "images": 4600},
            {"label": "Early Blight", "images": 4803},
            {"label": "Late Blight", "images": 6116},
        ],
        "image_count": 15519,
        "geography": ["Mainpuri", "Etawah", "Jaswantnagar", "Uttar Pradesh, India"],
        "collection_period": "Rabi 2025-26 (October 2025 to March 2026)",
        "verification": "Archives SHA-256 verified; extracted images decoded with Pillow.",
        "model_available": MODEL_PATH.is_file(),
        "status": "experimental",
        "limitations": LIMITATIONS,
    }


@lru_cache(maxsize=2)
def _load_model(model_mtime_ns: int, model_size: int):
    del model_mtime_ns, model_size
    if not MODEL_PATH.is_file():
        raise FileNotFoundError("PLDD-UP experimental model has not been trained")
    checkpoint = torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
    if checkpoint.get("dataset_id") != DATASET_ID or checkpoint.get("classes") != CLASSES:
        raise RuntimeError("PLDD-UP checkpoint metadata is incompatible")
    model = models.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.last_channel, len(CLASSES))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    preprocess = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(checkpoint["normalization_mean"], checkpoint["normalization_std"]),
    ])
    return model, preprocess, checkpoint["model_version"]


def load_model():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError("PLDD-UP experimental model has not been trained")
    stat = MODEL_PATH.stat()
    return _load_model(stat.st_mtime_ns, stat.st_size)


@router.post("/research/potato-leaf/predict")
def predict_potato_leaf(payload: PotatoPredictionRequest):
    try:
        encoded = payload.image
        if encoded.startswith("data:"):
            prefix, encoded = encoded.split(",", 1)
            if prefix not in (
                "data:image/jpeg;base64",
                "data:image/png;base64",
                "data:image/webp;base64",
            ):
                raise ValueError("Unsupported image type")
        if len(encoded) > 7_000_000:
            raise ValueError("Image too large")
        data = base64.b64decode(encoded, validate=True)
        if not data or len(data) > MAX_IMAGE_BYTES:
            raise ValueError("Image exceeds 5 MB")
        with Image.open(io.BytesIO(data)) as original:
            if original.format not in ("JPEG", "PNG", "WEBP"):
                raise ValueError("Unsupported image format")
            if original.width * original.height > 20_000_000:
                raise ValueError("Image exceeds 20 megapixels")
            original.load()
            image = ImageOps.exif_transpose(original).convert("RGB")
    except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise HTTPException(status_code=422, detail="Invalid or unsupported image") from error

    try:
        model, preprocess, model_version = load_model()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail="PLDD-UP experimental model is not trained or available") from error
    except (OSError, EOFError, KeyError, TypeError, ValueError, RuntimeError, pickle.UnpicklingError) as error:
        raise HTTPException(status_code=503, detail="PLDD-UP experimental model is unavailable") from error

    try:
        with torch.inference_mode():
            scores = torch.softmax(model(preprocess(image).unsqueeze(0)), dim=1)[0]
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="PLDD-UP experimental inference is unavailable") from error
    ranked = torch.argsort(scores, descending=True)
    predictions = [
        {"label": CLASSES[index.item()], "probability": round(float(scores[index.item()]), 6)}
        for index in ranked
    ]
    return {
        "status": "experimental",
        "crop": "potato",
        "dataset_id": DATASET_ID,
        "prediction": predictions[0]["label"],
        "probability": predictions[0]["probability"],
        "predictions": predictions,
        "model": model_version,
        "dataset_provenance": "Mendeley Data, DOI 10.17632/3j4nfkvp2n.1, CC BY 4.0",
        "limitations": LIMITATIONS,
        "disclaimer": (
            "Experimental potato leaf image classification only. "
            "Not a confirmed diagnosis, satellite observation, or field-level disease assessment."
        ),
    }
