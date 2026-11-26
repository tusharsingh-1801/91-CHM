"""Metrics, per-class tables, bootstrap CIs and McNemar test from saved predictions."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.metrics import (accuracy_score, precision_recall_fscore_support, classification_report,
                             confusion_matrix, balanced_accuracy_score)

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\work\vit\out")
audit = json.load(open(OUT / "dataset_audit.json")); classes = audit["classes"]
rng = np.random.default_rng(0)


def load(run):
    z = np.load(OUT / run / "test_pred.npz", allow_pickle=True)
    return z["y"], z["prob"].argmax(1), z["prob"]


def summary(y, p):
    r = {"n_test": int(len(y)), "accuracy": accuracy_score(y, p), "balanced_accuracy": balanced_accuracy_score(y, p)}
    for avg in ("macro", "weighted", "micro"):
        P, R, F, _ = precision_recall_fscore_support(y, p, average=avg, zero_division=0)
        r[f"{avg}_precision"], r[f"{avg}_recall"], r[f"{avg}_f1"] = P, R, F
    # macro computed by hand as a check
    P, R, F, S = precision_recall_fscore_support(y, p, labels=range(len(classes)), zero_division=0)
    r["macro_f1_by_hand"] = float(F.mean())
    # bootstrap 95% CI on accuracy and macro-F1
    accs, f1s = [], []
    for _ in range(1000):
        i = rng.integers(0, len(y), len(y))
        accs.append((y[i] == p[i]).mean())
        f1s.append(precision_recall_fscore_support(y[i], p[i], average="macro", zero_division=0)[2])
    r["accuracy_ci95"] = [float(np.percentile(accs, 2.5)), float(np.percentile(accs, 97.5))]
    r["macro_f1_ci95"] = [float(np.percentile(f1s, 2.5)), float(np.percentile(f1s, 97.5))]
    return {k: (float(v) if not isinstance(v, (list, int)) else v) for k, v in r.items()}


def per_class(y, p):
    P, R, F, S = precision_recall_fscore_support(y, p, labels=range(len(classes)), zero_division=0)
    return pd.DataFrame({"class": classes, "precision": P, "recall": R, "f1": F, "support": S})


res = {}
runs = [d.name for d in OUT.iterdir() if (d / "test_pred.npz").exists()]
for run in sorted(runs):
    y, p, _ = load(run)
    res[run] = summary(y, p)
    pc = per_class(y, p)
    pc.to_csv(OUT / f"per_class_{run}.csv", index=False)
    (OUT / f"per_class_{run}.tex").write_text(
        pc.assign(**{"class": pc["class"].str.replace("_", r"\_", regex=False)})
          .to_latex(index=False, float_format="%.4f"), encoding="utf8")
    np.save(OUT / f"confusion_{run}.npy", confusion_matrix(y, p, labels=range(len(classes))))
    # most frequent confusions
    cm = confusion_matrix(y, p, labels=range(len(classes))); np.fill_diagonal(cm, 0)
    top = np.dstack(np.unravel_index(np.argsort(-cm.ravel())[:8], cm.shape))[0]
    res[run]["top_confusions"] = [[classes[i], classes[j], int(cm[i, j])] for i, j in top if cm[i, j] > 0]

# McNemar: ViT vs MobileNetV2 on the same (group) test set
for split in ("group", "random"):
    a, b = f"vit_{split}", f"mnv2_{split}"
    if a in res and b in res:
        y1, p1, _ = load(a); y2, p2, _ = load(b)
        if len(y1) == len(y2) and (y1 == y2).all():
            n01 = int(((p1 == y1) & (p2 != y1)).sum()); n10 = int(((p1 != y1) & (p2 == y1)).sum())
            from scipy.stats import binomtest
            pv = binomtest(min(n01, n10), n01 + n10, 0.5).pvalue if n01 + n10 else 1.0
            res[f"mcnemar_{split}"] = {"vit_right_mnv2_wrong": n01, "mnv2_right_vit_wrong": n10, "p_value": float(pv)}

json.dump(res, open(OUT / "metrics.json", "w"), indent=1)
print(json.dumps(res, indent=1))
