"""Build the leakage-aware split for PlantVillage (raw/color, 38 classes).

Outputs (in OUT): splits.csv, dataset_audit.json

Leakage control: PlantVillage photographs the same leaf several times (rotated
or from different angles). We (1) hash every image with a dihedral-invariant
difference hash and union images whose hashes differ by <= HASH_T bits (within
the same class), and (2) split by connected component, so near-duplicates never
straddle train/val/test. A plain stratified random split ("random") is written
too, to measure how much leakage inflates accuracy.
"""
import json, re, sys, collections
from pathlib import Path
import numpy as np, pandas as pd
from PIL import Image
from concurrent.futures import ProcessPoolExecutor
from sklearn.model_selection import StratifiedGroupKFold, train_test_split

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\work\vit\pv\raw\color")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(r"C:\work\vit\out")
HASH_T = 6          # max Hamming distance (of 64 bits) to call two images the same leaf shot
SEED = 42
OUT.mkdir(parents=True, exist_ok=True)


def dhash(img, n=8):
    g = np.asarray(img.convert("L").resize((n + 1, n), Image.LANCZOS), dtype=np.int16)
    return (g[:, 1:] > g[:, :-1]).flatten()


def canon_hashes(path):
    """Hash under the 8 dihedral transforms; return all 8 as uint64 (rows)."""
    im = Image.open(path).convert("RGB")
    outs = []
    for k in range(4):
        r = im.rotate(90 * k, expand=True)
        for flip in (False, True):
            x = r.transpose(Image.FLIP_LEFT_RIGHT) if flip else r
            bits = dhash(x)
            outs.append(int("".join("1" if b else "0" for b in bits), 2))
    return outs


def main():
    files = sorted(p for p in ROOT.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    classes = sorted({p.parent.name for p in files})
    print(len(files), "images,", len(classes), "classes")
    with ProcessPoolExecutor(max_workers=8) as ex:
        hs = list(ex.map(canon_hashes, files, chunksize=256))
    df = pd.DataFrame({"path": [str(p) for p in files],
                       "label": [p.parent.name for p in files],
                       "fname": [p.name for p in files]})
    df["y"] = df.label.map({c: i for i, c in enumerate(classes)})
    df["uuid"] = df.fname.str.extract(r"^([0-9a-fA-F-]{36})")[0]
    H = np.array(hs, dtype=np.uint64)  # n x 8 (dihedral variants)
    LUT = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint8)

    # union-find over near-duplicates inside each class
    n = len(df)
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    for lab, idx in df.groupby("label").indices.items():
        idx = np.asarray(idx)
        allh = H[idx]                     # m x 8
        base = allh[:, 0]                 # identity hash of each image
        for a_pos in range(len(idx)):
            d = np.bitwise_xor(allh, base[a_pos])          # m x 8 uint64
            pc = LUT[d.view(np.uint8)].reshape(len(idx), 8, 8).sum(axis=2)
            m = pc.min(axis=1)
            for b_pos in np.nonzero(m <= HASH_T)[0]:
                if b_pos != a_pos:
                    union(int(idx[a_pos]), int(idx[b_pos]))
    df["group"] = [find(i) for i in range(n)]
    gsize = df.groupby("group").y.transform("size")
    df["group_size"] = gsize

    # ---- leakage-aware split: group-wise stratified 70/15/15 ----
    sgkf = StratifiedGroupKFold(n_splits=20, shuffle=True, random_state=SEED)
    folds = np.full(n, -1)
    for f, (_, te) in enumerate(sgkf.split(df, df.y, df.group)):
        folds[te] = f
    split = np.where(folds < 14, "train", np.where(folds < 17, "val", "test"))
    df["split_group"] = split
    # ---- naive random split for the leakage comparison ----
    tr, rest = train_test_split(np.arange(n), test_size=0.30, stratify=df.y, random_state=SEED)
    va, te = train_test_split(rest, test_size=0.5, stratify=df.y.iloc[rest], random_state=SEED)
    r = np.empty(n, dtype=object); r[tr] = "train"; r[va] = "val"; r[te] = "test"
    df["split_random"] = r

    # how much would the naive split leak?
    g_tr = set(df.group[df.split_random == "train"])
    leak_random = float(df.group[df.split_random == "test"].isin(g_tr).mean())
    g_tr2 = set(df.group[df.split_group == "train"])
    leak_group = float(df.group[df.split_group == "test"].isin(g_tr2).mean())

    audit = {
        "n_images": n, "n_classes": len(classes), "hash_threshold_bits": HASH_T,
        "n_groups": int(df.group.nunique()),
        "images_in_multi_image_groups": int((gsize > 1).sum()),
        "largest_group": int(gsize.max()),
        "uuid_unique": int(df.uuid.nunique()), "uuid_missing": int(df.uuid.isna().sum()),
        "test_images_whose_group_is_in_train__random_split": leak_random,
        "test_images_whose_group_is_in_train__group_split": leak_group,
        "split_sizes_group": df.split_group.value_counts().to_dict(),
        "split_sizes_random": df.split_random.value_counts().to_dict(),
        "class_counts": df.label.value_counts().sort_index().to_dict(),
        "classes": classes,
    }
    json.dump(audit, open(OUT / "dataset_audit.json", "w"), indent=1)
    df.drop(columns=["fname"]).to_csv(OUT / "splits.csv", index=False)
    print(json.dumps({k: v for k, v in audit.items() if k not in ("class_counts", "classes")}, indent=1))


if __name__ == "__main__":
    main()
