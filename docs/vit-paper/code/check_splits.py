"""Check that a locally regenerated splits.csv matches the released release/splits.csv.

usage: python check_splits.py RELEASED_CSV LOCAL_SPLITS_CSV
"""
import sys
import pandas as pd

rel = pd.read_csv(sys.argv[1])
loc = pd.read_csv(sys.argv[2])
loc["image"] = loc.path.str.replace("\\", "/", regex=False).str.split("/color/").str[-1]
m = rel.merge(loc[["image", "split_group", "split_random"]], on="image", suffixes=("", "_local"))
ok = len(m) == len(rel) == len(loc) and (m.split_group == m.split_group_local).all() \
     and (m.split_random == m.split_random_local).all()
print("images:", len(rel), "matched:", len(m), "splits identical:", ok)
sys.exit(0 if ok else 1)
