import copy
import csv
import json
import random
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from PIL import Image
from sklearn.metrics import accuracy_score, f1_score
from torch import nn
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms


ROOT = Path.cwd()
REPORTS = ROOT / "data/reports"
MODELS = ROOT / "data/models"

EPOCHS = 5
BATCH_SIZE = 16
LEARNING_RATE = 0.001
SEED = 42

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

# Intel macOS CPU
torch.set_num_threads(4)
device = torch.device("cpu")

print("Device:", device)


# Load train and validation manifests
train_df = pd.read_csv(
    REPORTS / "maize_train_final.csv"
)
val_df = pd.read_csv(
    REPORTS / "maize_val_final.csv"
)

classes = sorted(train_df["label"].unique())
class_to_idx = {
    name: i for i, name in enumerate(classes)
}

assert set(val_df["label"]).issubset(set(classes))

print("\nClasses:")
for name, idx in class_to_idx.items():
    print(idx, name)


# ImageNet normalization
mean = [0.485, 0.456, 0.406]
std = [0.229, 0.224, 0.225]

train_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(15),
    transforms.ToTensor(),
    transforms.Normalize(mean, std)
])

val_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean, std)
])


class MaizeDataset(Dataset):
    def __init__(self, df, transform):
        self.df = df.reset_index(drop=True)
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]

        with Image.open(row["image_path"]) as img:
            image = img.convert("RGB")

        image = self.transform(image)
        label = class_to_idx[row["label"]]

        return image, label


train_loader = DataLoader(
    MaizeDataset(train_df, train_transform),
    batch_size=BATCH_SIZE,
    shuffle=True,
    num_workers=0
)

val_loader = DataLoader(
    MaizeDataset(val_df, val_transform),
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0
)


print("\nLoading pretrained MobileNetV2...")

model = models.mobilenet_v2(
    weights=models.MobileNet_V2_Weights.DEFAULT
)

# Freeze pretrained feature extractor
for param in model.features.parameters():
    param.requires_grad = False

# Replace classification head
model.classifier[1] = nn.Linear(
    model.last_channel,
    len(classes)
)

model = model.to(device)

criterion = nn.CrossEntropyLoss()

optimizer = torch.optim.Adam(
    model.classifier.parameters(),
    lr=LEARNING_RATE
)


best_f1 = -1.0
best_state = None
history = []

print("\n========== TRAINING STARTED ==========")

for epoch in range(EPOCHS):

    model.train()

    # Keep frozen BatchNorm statistics unchanged
    model.features.eval()

    total_loss = 0.0
    total_samples = 0

    for images, labels in train_loader:

        images = images.to(device)
        labels = labels.to(device)

        optimizer.zero_grad()

        outputs = model(images)
        loss = criterion(outputs, labels)

        loss.backward()
        optimizer.step()

        total_loss += loss.item() * labels.size(0)
        total_samples += labels.size(0)

    train_loss = total_loss / total_samples

    # Validation
    model.eval()

    actual = []
    predicted = []

    with torch.no_grad():
        for images, labels in val_loader:

            images = images.to(device)
            outputs = model(images)

            preds = outputs.argmax(dim=1)

            actual.extend(labels.tolist())
            predicted.extend(preds.cpu().tolist())

    accuracy = accuracy_score(actual, predicted)
    macro_f1 = f1_score(
        actual,
        predicted,
        average="macro",
        zero_division=0
    )

    history.append({
        "epoch": epoch + 1,
        "train_loss": float(train_loss),
        "val_accuracy": float(accuracy),
        "val_macro_f1": float(macro_f1)
    })

    print(
        f"Epoch {epoch + 1}/{EPOCHS} | "
        f"Loss: {train_loss:.4f} | "
        f"Val Accuracy: {accuracy:.4f} | "
        f"Macro F1: {macro_f1:.4f}",
        flush=True
    )

    if macro_f1 > best_f1:
        best_f1 = macro_f1
        best_state = copy.deepcopy(model.state_dict())


# Save best model
MODELS.mkdir(parents=True, exist_ok=True)

model_path = MODELS / "maize_mobilenetv2.pth"

torch.save({
    "model_state_dict": best_state,
    "classes": classes,
    "class_to_idx": class_to_idx,
    "architecture": "mobilenet_v2",
    "image_size": 224,
    "normalization_mean": mean,
    "normalization_std": std,
    "best_val_macro_f1": float(best_f1)
}, model_path)

history_path = REPORTS / "maize_training_history.csv"

with history_path.open("w", newline="") as f:
    writer = csv.DictWriter(
        f,
        fieldnames=[
            "epoch",
            "train_loss",
            "val_accuracy",
            "val_macro_f1"
        ]
    )
    writer.writeheader()
    writer.writerows(history)

print("\n========== TRAINING COMPLETE ==========")
print("Best validation macro F1:", round(best_f1, 4))
print("Saved model:", model_path)
print("Training history:", history_path)
print("Test dataset remains untouched.")
