import base64
import io
import os
from functools import lru_cache
from pathlib import Path

import torch
from torch import nn
from torchvision import models, transforms
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

MODEL_PATH = Path(
    os.environ.get(
        "TERRASCOPE_MAIZE_MODEL",
        str(Path(__file__).resolve().parents[2] /
            "data/models/maize_mobilenetv2.pth")
    )
)

MAX_IMAGE_BYTES = 5 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000


class MaizePredictionRequest(BaseModel):
    image: str


@lru_cache(maxsize=1)
def load_model():
    if not MODEL_PATH.is_file():
        raise RuntimeError("Maize model checkpoint missing")

    # Load only our own locally trained trusted checkpoint.
    checkpoint = torch.load(
        MODEL_PATH,
        map_location="cpu",
        weights_only=False
    )

    classes = checkpoint["classes"]

    model = models.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(
        model.last_channel, len(classes)
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            checkpoint["normalization_mean"],
            checkpoint["normalization_std"]
        )
    ])

    return model, transform, classes


@router.post("/predict-maize")
def predict_maize(payload: MaizePredictionRequest):
    try:
        encoded = payload.image

        if encoded.startswith("data:"):
            prefix, encoded = encoded.split(",", 1)
            if prefix not in (
                "data:image/jpeg;base64",
                "data:image/png;base64",
                "data:image/webp;base64"
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
            image = ImageOps.exif_transpose(original).convert("RGB")

        model, transform, classes = load_model()
        tensor = transform(image).unsqueeze(0)

        with torch.inference_mode():
            scores = torch.softmax(model(tensor), dim=1)[0]

        ranking = torch.argsort(scores, descending=True)

        predictions = [
            {
                "label": classes[index.item()],
                "probability": round(
                    float(scores[index.item()]), 6
                )
            }
            for index in ranking
        ]

        return {
            "status": "experimental",
            "crop": "maize",
            "prediction": predictions[0]["label"],
            "probability": predictions[0]["probability"],
            "predictions": predictions,
            "model": "mobilenet_v2",
            "disclaimer": (
                "Research-only leaf image classification. "
                "Not a confirmed agricultural disease diagnosis."
            )
        }

    except (
        ValueError,
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError
    ) as exc:
        raise HTTPException(
            status_code=422,
            detail="Invalid or unsupported image"
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail="Maize prediction model unavailable"
        ) from exc
