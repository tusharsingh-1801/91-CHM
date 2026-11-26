"""Attention rollout for the fine-tuned ViT, with two quantitative checks.

1. Leaf-mass: share of rollout attention that falls inside an approximate leaf mask,
   compared with the share of image area the mask covers (ratio > 1 = focuses on leaf).
2. Deletion test (faithfulness): zero the top-k% patches ranked by rollout vs random k%
   patches; a faithful map should drop the true-class probability more than random.
Also writes a figure of examples.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd, torch, timm, cv2
from PIL import Image
import torchvision.transforms as T
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\work\vit\out")
N = int(sys.argv[2]) if len(sys.argv) > 2 else 400
dev = "cuda"
classes = json.load(open(OUT / "dataset_audit.json"))["classes"]
model = timm.create_model("vit_base_patch16_224.augreg_in21k_ft_in1k", pretrained=False, num_classes=38)
model.load_state_dict(torch.load(OUT / "vit_group" / "best.pt")); model.to(dev).eval()
cfg = timm.data.resolve_data_config({}, model=model)
tf = T.Compose([T.Resize(224), T.ToTensor(), T.Normalize(cfg["mean"], cfg["std"])])

attn_maps = []
for blk in model.blocks:
    blk.attn.fused_attn = False
    blk.attn.attn_drop.register_forward_hook(lambda m, i, o: attn_maps.append(i[0].detach()))


def rollout(x):
    attn_maps.clear()
    with torch.no_grad():
        logits = model(x)
    R = torch.eye(attn_maps[0].shape[-1], device=x.device)[None].repeat(x.shape[0], 1, 1)
    for A in attn_maps:
        A = A.mean(1)
        A = 0.5 * A + 0.5 * torch.eye(A.shape[-1], device=A.device)
        A = A / A.sum(-1, keepdim=True)
        R = A @ R
    m = R[:, 0, 1:]                                   # CLS -> patches
    return logits, m.reshape(-1, 14, 14)


def leaf_mask(img_rgb):
    """Approximate leaf mask: pixels far from the median border colour, largest blob, filled."""
    im = cv2.resize(np.asarray(img_rgb), (224, 224)).astype(np.float32)
    border = np.concatenate([im[:6].reshape(-1, 3), im[-6:].reshape(-1, 3), im[:, :6].reshape(-1, 3), im[:, -6:].reshape(-1, 3)])
    bg = np.median(border, 0)
    d = np.linalg.norm(im - bg, axis=2)
    m = (d > max(25, np.percentile(d, 20))).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        m = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    return m


df = pd.read_csv(OUT / "splits.csv")
test = df[df.split_group == "test"].sample(N, random_state=0)
rows, examples = [], []
rng = np.random.default_rng(0)
for _, r in test.iterrows():
    img = Image.open(r.path).convert("RGB"); x = tf(img)[None].to(dev)
    logits, m = rollout(x)
    pred = int(logits.argmax(1)); prob = logits.softmax(1)[0]
    mm = m[0].cpu().numpy(); mm = (mm - mm.min()) / (mm.max() - mm.min() + 1e-9)
    up = cv2.resize(mm, (224, 224), interpolation=cv2.INTER_CUBIC)
    lm = leaf_mask(img)
    inside = float((up * lm).sum() / (up.sum() + 1e-9)); area = float(lm.mean())
    out = {"y": int(r.y), "pred": pred, "inside_mass": inside, "leaf_area": area}
    if pred == r.y:
        flat = m[0].flatten()
        for k in (0.1, 0.25):
            nk = int(k * 196)
            def mask_and_score(idx):
                xx = x.clone().reshape(1, 3, 14, 16, 14, 16)
                for i in idx.tolist():
                    xx[:, :, i // 14, :, i % 14, :] = 0
                with torch.no_grad():
                    return float(model(xx.reshape(1, 3, 224, 224)).softmax(1)[0, pred])
            out[f"drop_top{int(k*100)}"] = float(prob[pred]) - mask_and_score(flat.topk(nk).indices.cpu())
            out[f"drop_bottom{int(k*100)}"] = float(prob[pred]) - mask_and_score((-flat).topk(nk).indices.cpu())
            out[f"drop_rand{int(k*100)}"] = float(prob[pred]) - float(np.mean(
                [mask_and_score(torch.as_tensor(rng.choice(196, nk, replace=False))) for _ in range(3)]))
    rows.append(out)
    if len(examples) < 8 and pred == r.y and r.y not in [e[3] for e in examples]:
        examples.append((np.asarray(img.resize((224, 224))), up, lm, int(r.y)))

d = pd.DataFrame(rows)
ok = d[d.pred == d.y]
res = {"n_images": len(d), "n_correct": len(ok),
       "mean_attention_inside_leaf": float(d.inside_mass.mean()),
       "mean_leaf_area_fraction": float(d.leaf_area.mean()),
       "inside_over_area_ratio_median": float((d.inside_mass / d.leaf_area.clip(lower=1e-3)).median()),
       "fraction_images_ratio_gt1": float(((d.inside_mass / d.leaf_area.clip(lower=1e-3)) > 1).mean())}
for k in (10, 25):
    for kind in ("top", "rand", "bottom"):
        res[f"mean_prob_drop_{kind}{k}"] = float(ok[f"drop_{kind}{k}"].mean())
json.dump(res, open(OUT / "rollout_results.json", "w"), indent=1); d.to_csv(OUT / "rollout_per_image.csv", index=False)
print(json.dumps(res, indent=1))

fig, ax = plt.subplots(2, 8, figsize=(16, 4.4))
for j, (im, up, lm, y) in enumerate(examples):
    ax[0, j].imshow(im); ax[0, j].set_title(classes[y].replace("___", "\n").replace("_", " ")[:28], fontsize=6)
    ax[1, j].imshow(im); ax[1, j].imshow(up, cmap="jet", alpha=0.5)
    for a_ in (ax[0, j], ax[1, j]): a_.axis("off")
plt.tight_layout(); plt.savefig(OUT / "fig_rollout.png", dpi=200)
