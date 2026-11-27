# ViT vs MobileNetV2 on PlantVillage: code, split list and results

Fine-tuned ViT-B/16 and MobileNetV2 on the 38-class PlantVillage dataset with a
near-duplicate-aware split, plus attention-rollout checks and a deployment-cost
benchmark. Three seeds, 3 epochs per model, and one random-split run per model.

## Contents

| Path | What it is |
|---|---|
| `release/splits.csv` | One row per image: relative path, label, class id, near-duplicate group id, and the split in both the grouped (`split_group`) and plain random (`split_random`) schemes |
| `code/prepare.py` | Builds the groups and splits from the raw images (deterministic, seed 42) |
| `code/train.py` | Fine-tunes `vit` or `mnv2` |
| `code/evaluate.py` | Metrics, per-class tables, bootstrap CIs, McNemar test |
| `code/benchmark.py` | Parameters, size, GMACs, CPU/GPU latency |
| `code/rollout.py` | Attention rollout, leaf-mask check, deletion test, figure |
| `code/export_splits.py`, `code/check_splits.py` | Write `splits.csv`, and check a regenerated one matches it |
| `results/` | Metrics, per-class tables, training histories, benchmark, rollout results and figure |
| `release/requirements.txt` | Exact package versions used (Python 3.11, CUDA 12.6 build of torch) |

## Data

Images are **not** redistributed here. Download PlantVillage from
https://github.com/spMohanty/PlantVillage-Dataset (git commit
`7f7ecc7e1eaca78107e3affe7cb5abd9427e139a`, folder `raw/color`). It has 54,305
images in 38 classes, as used here. Original dataset: Hughes and Salathe,
arXiv:1511.08060; Mohanty, Hughes and Salathe, Front. Plant Sci. 2016.

Licence: the GitHub repository has no LICENSE file; its `README_HF.md` front
matter states `cc-by-sa-3.0` (checked in the clone at the commit above). We
cloned that repository on 26 November 2026; check the terms of the copy you
download. The code is released under the MIT licence (see `LICENSE` in
`docs/vit-paper`). The split list and result files, which are derived from the
dataset's file names and labels, are released under CC BY-SA 3.0
(https://creativecommons.org/licenses/by-sa/3.0/), the licence the dataset
repository declares.

## Reproduce

```
pip install -r release/requirements.txt
python code/prepare.py <PlantVillage>/raw/color <OUT>            # writes <OUT>/splits.csv
python code/check_splits.py release/splits.csv <OUT>/splits.csv  # expect: splits identical: True
python code/train.py --model mnv2 --split group --out <OUT>
python code/train.py --model vit  --split group --out <OUT>
python code/evaluate.py <OUT>
python code/benchmark.py <OUT>
python code/rollout.py <OUT>
```

`train.py` defaults to `--epochs 3`, batch size 32, AdamW, one-cycle schedule,
learning rate 3e-5 (ViT) and 1e-3 (MobileNetV2). Pretrained weights come from
timm: `vit_base_patch16_224.augreg_in21k_ft_in1k` and `mobilenetv2_100.ra_in1k`.
Training used one RTX 4050 laptop GPU with mixed precision; ViT took about
8 minutes per epoch. Results can differ slightly between GPUs and library
versions.

## Results (grouped split, 8,155 test images)

| | ViT-B/16 | MobileNetV2 |
|---|---|---|
| Accuracy | 0.9989 | 0.9978 |
| Macro F1 | 0.9976 | 0.9955 |
| Parameters | 85.8 M | 2.27 M |
| CPU latency, batch 1 | 223 ms | 22.8 ms |

Seed 42 is shown. Over three seeds ViT averages 0.9987 and MobileNetV2 0.9976
(ViT ahead on every seed; McNemar significant on one of three, p = 0.078, 0.017,
0.42). Full numbers are in `results/` (`seed_summary.json`).

## Limitations

- Three seeds and 3 epochs; the seeds share one split and test set. The random-split
  comparison is a single run on a different test set.
- Grouping uses a perceptual-hash threshold of 6 bits, so it removes near-duplicate
  photos but is not a guarantee that no leaf is shared across splits.
- PlantVillage only: no cross-dataset test (for example PlantDoc), so these numbers
  say little about field images.
- Attention rollout showed no preference for the leaf over background; do not read
  the maps as lesion localisation.
- GPU latency was measured on a laptop GPU and is noisy.

## Weights

Trained weights are released for research use as GitHub release
[`vit-paper-v1.0`](https://github.com/tusharsingh-1801/91-CHM/releases/tag/vit-paper-v1.0). Both are seed-42 runs on the near-duplicate-aware
split, as reported in the paper.

| File | Model | Size (bytes) | SHA-256 |
|---|---|---|---|
| `vit_b16_group_seed42_best.pt` | ViT-B/16 | 343,360,373 | `74952491592021eb90119a6ae688e82baa7efe80c2a0e80040f0359f4c2965ec` |
| `mobilenetv2_group_seed42_best.pt` | MobileNetV2 | 9,319,115 | `b65cc61d34f508e06b673732877d792a453531ab1091f1dc93dc0e53275df613` |

Verify a download with `sha256sum <file>`. The weights were trained on
PlantVillage, whose upstream repository has no licence file and declares
CC BY-SA 3.0 in its `README_HF.md`. Users must check the dataset's terms before
reuse; share-alike obligations may apply. The weights are not validated for field
use and are not a diagnostic tool.

**DOI.** Publishing the release minted Zenodo DOI [10.5281/zenodo.24590449](https://doi.org/10.5281/zenodo.24590449) (all versions: [10.5281/zenodo.24590448](https://doi.org/10.5281/zenodo.24590448)). Zenodo archives a snapshot of the repository source (code, split list, results) at the release tag; it does **not** archive the two weight files, which are the GitHub release assets above and are identified by the SHA-256 checksums in the table. The Zenodo record's licence field defaulted to CC BY 4.0; the licences that apply are those stated in this README (code MIT, split list and result files CC BY-SA 3.0).

## Citation

T. Singh, A. Singh, V. Thakur and S. Sharma, "Fine-Tuned Vision Transformer
for 38-Class Plant Leaf Disease Classification with Attention-Rollout
Explanations and Efficiency Benchmarking," 2026 (manuscript). Code:
https://github.com/tusharsingh-1801/91-CHM (directory `docs/vit-paper`). Repository snapshot DOI: 10.5281/zenodo.24590449.
