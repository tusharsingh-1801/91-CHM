"""Write the releasable split list: relative image paths, no machine-specific prefix.

usage: python export_splits.py LOCAL_SPLITS_CSV OUT_CSV
"""
import sys
import pandas as pd

d = pd.read_csv(sys.argv[1])
d["image"] = d.path.str.replace("\\", "/", regex=False).str.split("/color/").str[-1]
d = d.rename(columns={"y": "class_id", "group": "group_id"})
d = d[["image", "label", "class_id", "group_id", "group_size", "split_group", "split_random"]]
assert d.image.is_unique
d.to_csv(sys.argv[2], index=False)
print(len(d), d.split_group.value_counts().to_dict())
