import json
from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score
)
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from torch import nn

root = Path.cwd()
reports = root / "data/reports"
model_path = root / "data/models/maize_mobilenetv2.pth"

# Load checkpoint created by our training script
checkpoint = torch.load(
    model_path,
    map_location="cpu",
    weights_only=False
)

classes = checkpoint["classes"]
class_to_idx = checkpoint["class_to_idx"]

test_df = pd.read_csv(reports / "maize_test_ready.csv")

assert set(test_df["label"]).issubset(set(classes))
assert not test_df["image_path"].duplicated().any()

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        checkpoint["normalization_mean"],
        checkpoint["normalization_std"]
    )
])

class TestDataset(Dataset):
    def __len__(self):
        return len(test_df)

    def __getitem__(self, index):
        row = test_df.iloc[index]
        with Image.open(row["image_path"]) as img:
            image = transform(img.convert("RGB"))
        return image, class_to_idx[row["label"]]

loader = DataLoader(
    TestDataset(),
    batch_size=16,
    shuffle=False,
    num_workers=0
)

model = models.mobilenet_v2(weights=None)
model.classifier[1] = nn.Linear(
    model.last_channel,
    len(classes)
)
model.load_state_dict(checkpoint["model_state_dict"])
model.eval()

actual = []
predicted = []

print("Evaluating reserved test images...", flush=True)

with torch.inference_mode():
    for images, labels in loader:
        outputs = model(images)
        preds = outputs.argmax(dim=1)

        actual.extend(labels.tolist())
        predicted.extend(preds.tolist())

accuracy = accuracy_score(actual, predicted)
macro_f1 = f1_score(
    actual, predicted,
    average="macro",
    zero_division=0
)

report = classification_report(
    actual, predicted,
    labels=list(range(len(classes))),
    target_names=classes,
    zero_division=0,
    output_dict=True
)

matrix = confusion_matrix(
    actual, predicted,
    labels=list(range(len(classes)))
)

print("\n========== FINAL TEST RESULTS ==========")
print("Test images:", len(actual))
print(f"Test Accuracy: {accuracy:.4%}")
print(f"Macro F1: {macro_f1:.4f}")

print("\n=== PER-CLASS METRICS ===")
print(classification_report(
    actual, predicted,
    labels=list(range(len(classes))),
    target_names=classes,
    zero_division=0
))

print("\n=== CONFUSION MATRIX ===")
print(matrix)

results = {
    "test_images": len(actual),
    "accuracy": float(accuracy),
    "macro_f1": float(macro_f1),
    "classes": classes,
    "classification_report": report,
    "confusion_matrix": matrix.tolist(),
    "evaluation_note": (
        "PlantVillage official test split. "
        "Field-image generalization not established."
    )
}

output = reports / "maize_final_test_results.json"
output.write_text(
    json.dumps(results, indent=2),
    encoding="utf-8"
)

print("\nSaved:", output)
