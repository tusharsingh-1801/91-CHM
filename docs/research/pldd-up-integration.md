# PLDD-UP potato leaf disease research integration

## Dataset and attribution

PLDD-UP is a field-photo research dataset published by its authors on Mendeley Data:

- Source: https://data.mendeley.com/datasets/3j4nfkvp2n/1
- DOI: https://doi.org/10.17632/3j4nfkvp2n.1
- Contributors shown on the Mendeley Data record: Prakash Kumar Singh and Aseem Chandel.
- License: CC BY 4.0. Attribute the listed contributors and source record and retain the DOI/license for permitted reuse. CC BY 4.0 does not by itself resolve all model, privacy, or deployment obligations.
- Collection: Rabi 2025-26 (October 2025–March 2026), Mainpuri, Etawah and Jaswantnagar, Uttar Pradesh.
- Class distribution: Healthy 4,600; Early Blight 4,803; Late Blight 6,116 (15,519 total).
- Local source: `.local/datasets/up/pldd-up/`; extracted images are under `.local/datasets/up/pldd-up/extracted/`. These ignored local files are not checked into Git or copied to PostgreSQL.
- Source `manifest.json` records the SHA-256 verification of `EB.zip`, `Healthy.zip`, and `LB.zip`. The integration never downloads, extracts, deletes, or modifies those sources.

The canonical app catalog entry is `datasets/catalog.json`; the `/datasets` page displays its provenance and limitations. Attribution is also recorded in `datasets/ATTRIBUTION.md`.

## Scientific scope

These are field-collected camera photographs for experimental image classification. They are **not** live satellite crop-health observations, satellite-matched field-level disease labels, or evidence that a specific saved field has a disease. The dataset is limited to the reported local geography and collection period; it is not representative of every Uttar Pradesh district or potato variety. No commercial diagnostic validity is claimed. Experimental probabilities are model scores, not calibrated diagnostic confidence; users should verify symptoms in the field with an agricultural expert before treatment.

## Inventory, validation and leakage-safe splits

The offline, read-only inventory pipeline checks the class-folder names, expected per-class and total counts, file checksums, Pillow decode/readability, dimensions and formats. It records exact SHA-256 duplicate groups and conservative 64-bit difference-hash near-duplicate *candidates* (Hamming distance <= 3). Perceptual matches are not confirmed duplicates. It does not delete or rewrite any image. All exact/perceptual candidate groups stay within one split; mixed-label candidate groups are reported. The report also includes class counts, format/dimension statistics, split counts and a leakage audit.

From the project root on Windows:

```powershell
.\.venv\Scripts\python.exe scripts\prepare-pldd-up.py
```

Outputs are written separately from source images to the ignored path `.local/datasets/up/pldd-up/processed/`:

- `inventory.json`: per-image metadata, relative source filename, checksum, candidate duplicate group and split.
- `training-manifest.json`: machine-readable per-image manifest for training.
- `validation-report.json`: concise validation and leakage summary.

The seed defaults to `42` and can be set with `--seed`. `--source`, `--manifest`, and `--output` can select other local paths. The actual manifest references images by relative path; paths are resolved and checked to remain inside the image root before loading.
The inventory command refuses to write inside the extracted image tree or overwrite an existing report; use a fresh output directory for another run.

## Experimental training and evaluation

Training is deliberately separate from production field-health and maize models. It uses MobileNetV2 from the installed torchvision package. The local torch checkpoint cache was checked and no pretrained weights were available; training therefore starts with random initialization and does not download weights. Training-only augmentation is horizontal flip, small rotation, and color jitter. Validation/test data only receives resizing and fixed ImageNet normalization. The pipeline requires all classes in train, validation, and held-out test splits, rechecks every source image SHA-256, verifies duplicate-group/checksum split isolation, and writes under `.local/models/pldd-up/` without overwriting an existing output directory.

After inventory succeeds:

```powershell
.\.venv\Scripts\python.exe scripts\train-pldd-up.py --epochs 10 --batch-size 32
```

CPU is selected when CUDA is unavailable. Training the full dataset on CPU may be lengthy. No model is considered trained unless this command completes and produces `model.pth`, `best-checkpoint.pth`, `model-metadata.json`, `evaluation.json`, `training-history.json`, and `learning-curves.png`. Test metrics come only from the held-out test partition. The report includes accuracy, macro/per-class precision, recall and F1, confusion matrix, model/checksum metadata, split counts and elapsed duration. The random-initialization choice is explicit; benchmark quality should not be assumed.

Use a new, empty `--output` path for separate training runs. Existing model artifacts are never replaced automatically. Existing unrelated models are not used or retrained.

## API and UI behavior

- `GET /api/research/potato-leaf` reports dataset identifier and whether the isolated local model artifact is available.
- `POST /api/research/potato-leaf/predict` accepts a JSON `image` data URL, authenticates through the existing API account middleware, rate-limits requests, accepts only JPEG/PNG/WebP under 5 MB, validates file signature and decodability, and rejects images above 20 megapixels. The engine only loads the fixed local PLDD-UP model path and returns 503 when it has not been trained.
- The API does not expose server paths or accept caller-supplied model paths. Uploads are processed in memory and are not saved to the field diary or database.
- The `/datasets` research page shows an explicit unavailable state until a model exists. When present, it reports experimental class probabilities and repeats that the result is not a confirmed diagnosis or satellite/field-level assessment.

The upload feature is optional research tooling; satellite indicators and leaf-photo classification remain separate products and evidence types.

## Reproducibility and attribution checklist

1. Keep the downloaded archives and extracted source tree unchanged.
2. Record Python package versions and the seed used for a run; the project engine requirements pin Pillow, torch, torchvision, NumPy, scikit-learn and matplotlib.
3. Run the inventory script and retain the generated source manifest checksum, split manifest, validation report, and duplicate audit with any experiment.
4. Train only to a new output directory; keep the held-out test set fixed and do not tune against it.
5. Attribute Prakash Kumar Singh, Aseem Chandel, the Mendeley Data DOI, and CC BY 4.0 when sharing outputs or permitted derivatives. Separately review any downstream model, privacy, or deployment terms.

## Verification state

The source archive checksums and previously reported Pillow validation are recorded in the supplied local manifest and project handoff. The repository pipeline provides an independent repeatable check. Model training and measured test metrics are intentionally not claimed until a training run actually completes.
