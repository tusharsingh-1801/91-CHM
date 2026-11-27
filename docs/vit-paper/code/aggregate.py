"""Aggregate the three grouped-split seeds and the random-split run into results/seed_summary.json.

usage: python aggregate.py OUT_SEED42 OUT_SEED43 OUT_SEED44 DEST_JSON
OUT_SEED42 must also hold the random-split runs (mnv2_random, vit_random).
"""
import json, sys
import numpy as np

dirs, dest = sys.argv[1:4], sys.argv[4]
seeds = {"42": dirs[0], "43": dirs[1], "44": dirs[2]}
M = {s: json.load(open(f"{d}/metrics.json")) for s, d in seeds.items()}
res = {"per_seed": {}, "mean_std": {}}
for model in ("vit", "mnv2"):
    for metric in ("accuracy", "macro_f1"):
        v = [M[s][f"{model}_group"][metric] for s in seeds]
        res["mean_std"][f"{model}_{metric}"] = {"values": v, "mean": float(np.mean(v)), "std": float(np.std(v, ddof=1))}
for s in seeds:
    res["per_seed"][s] = {"mcnemar": M[s]["mcnemar_group"],
                          "vit_acc": M[s]["vit_group"]["accuracy"], "mnv2_acc": M[s]["mnv2_group"]["accuracy"]}
diff = [M[s]["vit_group"]["accuracy"] - M[s]["mnv2_group"]["accuracy"] for s in seeds]
res["vit_minus_mnv2_accuracy"] = {"values": diff, "mean": float(np.mean(diff))}
r = M["42"]
res["random_split_seed42"] = {m: {"accuracy": r[f"{m}_random"]["accuracy"], "macro_f1": r[f"{m}_random"]["macro_f1"],
                                  "accuracy_ci95": r[f"{m}_random"]["accuracy_ci95"]} for m in ("vit", "mnv2")}
res["random_split_seed42"]["mcnemar"] = r["mcnemar_random"]
json.dump(res, open(dest, "w"), indent=1)
print(json.dumps(res, indent=1))
