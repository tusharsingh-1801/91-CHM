"""Fine-tune ViT-B/16 or MobileNetV2 on PlantVillage (38 classes).

usage: python train.py --model vit|mnv2 --split group|random --epochs 3
Writes OUT/<model>_<split>/{best.pt, test_pred.npz, history.json}
"""
import argparse, json, time
from pathlib import Path
import numpy as np, pandas as pd, torch, torch.nn as nn, timm
from PIL import Image
from torch.utils.data import Dataset, DataLoader
import torchvision.transforms as T

class DS(Dataset):
    def __init__(self, d, tf): self.p, self.y, self.tf = d.path.tolist(), d.y.tolist(), tf
    def __len__(self): return len(self.p)
    def __getitem__(self, i): return self.tf(Image.open(self.p[i]).convert("RGB")), self.y[i]


def main():
    global a
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=["vit", "mnv2"])
    ap.add_argument("--split", default="group", choices=["group", "random"])
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--bs", type=int, default=32)
    ap.add_argument("--lr", type=float, default=None)
    ap.add_argument("--out", default=r"C:\work\vit\out")
    ap.add_argument("--limit", type=int, default=0, help="debug: cap images per split")
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()

    torch.manual_seed(a.seed); np.random.seed(a.seed)
    OUT = Path(a.out); run = OUT / f"{a.model}_{a.split}"; run.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(OUT / "splits.csv")
    col = "split_group" if a.split == "group" else "split_random"
    NC = df.y.nunique()

    NAMES = {"vit": "vit_base_patch16_224.augreg_in21k_ft_in1k", "mnv2": "mobilenetv2_100.ra_in1k"}
    model = timm.create_model(NAMES[a.model], pretrained=True, num_classes=NC)
    cfg = model.pretrained_cfg
    mean, std = cfg["mean"], cfg["std"]
    tf_train = T.Compose([T.RandomResizedCrop(224, scale=(0.6, 1.0)), T.RandomHorizontalFlip(),
                          T.RandomVerticalFlip(), T.ColorJitter(0.2, 0.2, 0.1), T.ToTensor(), T.Normalize(mean, std)])
    tf_eval = T.Compose([T.Resize(224), T.ToTensor(), T.Normalize(mean, std)])


    def sub(s):
        d = df[df[col] == s]
        return d.groupby("y", group_keys=False).head(max(1, a.limit // NC)) if a.limit else d

    dl = lambda d, tf, sh: DataLoader(DS(d, tf), batch_size=a.bs, shuffle=sh, num_workers=6,
                                      pin_memory=True, persistent_workers=True, drop_last=sh)
    tr, va, te = sub("train"), sub("val"), sub("test")
    L_tr, L_va, L_te = dl(tr, tf_train, True), dl(va, tf_eval, False), dl(te, tf_eval, False)
    dev = "cuda"
    model.to(dev)
    lr = a.lr or (3e-5 if a.model == "vit" else 1e-3)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)
    steps = a.epochs * len(L_tr)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps, pct_start=0.1)
    scaler = torch.amp.GradScaler()
    crit = nn.CrossEntropyLoss(label_smoothing=0.1)


    @torch.no_grad()
    def predict(loader):
        model.eval(); P, Y = [], []
        for x, y in loader:
            with torch.autocast("cuda", dtype=torch.float16):
                P.append(model(x.to(dev, non_blocking=True)).float().softmax(1).cpu())
            Y.append(y)
        return torch.cat(P).numpy(), torch.cat(Y).numpy()


    hist, best = [], -1
    for ep in range(a.epochs):
        model.train(); t0 = time.time(); tl = n = 0
        for x, y in L_tr:
            x, y = x.to(dev, non_blocking=True), y.to(dev, non_blocking=True)
            with torch.autocast("cuda", dtype=torch.float16):
                loss = crit(model(x), y)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward(); scaler.step(opt); scaler.update(); sched.step()
            tl += loss.item() * len(y); n += len(y)
        P, Y = predict(L_va); acc = float((P.argmax(1) == Y).mean())
        hist.append({"epoch": ep + 1, "train_loss": tl / n, "val_acc": acc, "sec": time.time() - t0})
        print(hist[-1], flush=True)
        if acc > best:
            best = acc; torch.save(model.state_dict(), run / "best.pt")

    model.load_state_dict(torch.load(run / "best.pt"))
    P, Y = predict(L_te)
    np.savez(run / "test_pred.npz", prob=P, y=Y, path=te.path.values)
    json.dump({"history": hist, "best_val_acc": best, "test_acc": float((P.argmax(1) == Y).mean()),
               "timm_name": NAMES[a.model], "lr": lr, "epochs": a.epochs, "bs": a.bs, "seed": a.seed,
               "n_train": len(tr), "n_val": len(va), "n_test": len(te)}, open(run / "history.json", "w"), indent=1)
    print("test acc", (P.argmax(1) == Y).mean())


if __name__ == "__main__":
    main()
