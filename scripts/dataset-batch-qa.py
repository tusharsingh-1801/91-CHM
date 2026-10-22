#!/usr/bin/env python3
"""TerraScope one-pass CropHarvest dataset QA and readiness report.

Reads the existing official labels; never invents satellite features or model
metrics. Preserves official test labels. Outputs aggregate evidence only.
"""
import argparse
import collections
import datetime as datetime
import hashlib
import json
from pathlib import Path

def stream(path):
    try:
        import ijson
    except ImportError:
        with path.open(encoding="utf-8") as f:
            yield from json.load(f)["features"]
    else:
        with path.open("rb") as f:
            yield from ijson.items(f, "features.item")

def audit(path, out):
    counts=collections.Counter()
    datasets=collections.defaultdict(lambda: collections.Counter())
    issues=collections.Counter()
    dates=collections.Counter()
    years=collections.Counter()
    geographies=collections.Counter()
    examples=[]
    seen=set()
    duplicates=0
    official_test=0
    total=0
    for i, feat in enumerate(stream(path)):
        total+=1
        p=feat.get("properties") or {}
        source=p.get("dataset")
        crop=p.get("is_crop")
        test=p.get("is_test")
        geo=feat.get("geometry")
        errors=[]
        if not isinstance(source,str) or not source.strip():errors.append("missing_source")
        if type(crop) is not int or crop not in (0,1):errors.append("invalid_crop_label")
        if type(test) is not bool:errors.append("invalid_test_flag")
        if not isinstance(geo,dict) or not geo.get("coordinates"):errors.append("missing_geometry")
        lat,lon=p.get("lat"),p.get("lon")
        if not isinstance(lat,(float,int)) or not -90<=lat<=90 or not isinstance(lon,(float,int)) or not -180<=lon<=180:errors.append("invalid_coordinates")
        if errors:
            for e in errors:issues[e]+=1
            if len(examples)<20:examples.append({"feature_index":i,"dataset":source,"issues":errors})
            continue
        official_test+=int(test)
        key=(source,round(lat,5),round(lon,5),str(p.get("collection_date")))
        if key in seen:duplicates+=1
        else:seen.add(key)
        split="official_test" if test else "development"
        counts[(split,crop)]+=1
        datasets[source][f"{split}_crop_{crop}"]+=1
        geographies[f"{int(lat//5)*5}:{int(lon//5)*5}"]+=1
        date=p.get("collection_date")
        if date:
            try:years[str(datetime.date.fromisoformat(str(date)[:10]).year)]+=1
            except ValueError:dates["invalid_collection_date"]+=1
        else:dates["missing_collection_date"]+=1
    valid=sum(counts.values())
    non_test=sum(v for (s,c),v in counts.items() if s=="development")
    dev_sources={s:sum(n for k,n in c.items() if k.startswith("development")) for s,c in datasets.items()}
    candidates=sorted(dev_sources.items(),key=lambda kv:(kv[1],kv[0]))
    target=max(1,round(non_test*.15))
    selected=set()
    selected_total=0
    # Greedy source-level holdout, selecting smaller sources first; this is
    # diagnostic only and must be reviewed for regional/class coverage.
    for source,n in candidates:
        if selected_total>=target:break
        if n>0 and selected_total+n<=target*1.2:
            selected.add(source);selected_total+=n
    validation=collections.Counter()
    training=collections.Counter()
    for source,c in datasets.items():
        bucket=validation if source in selected else training
        for crop in (0,1):
            bucket[str(crop)]+=c.get(f"development_crop_{crop}",0)
    report={
      "provider":"NASA Harvest CropHarvest",
      "status":"labels_quality_checked_not_model_ready",
      "source":str(path),
      "features_total":total,
      "features_valid":valid,
      "invalid_count":total-valid,
      "invalid_reasons":dict(issues),
      "invalid_examples":examples,
      "duplicate_source_location_date_keys":duplicates,
      "official_test_count":official_test,
      "official_test_class_counts":{str(c):counts[("official_test",c)] for c in (0,1)},
      "development_class_counts":{str(c):counts[("development",c)] for c in (0,1)},
      "proposed_validation_sources":sorted(selected),
      "proposed_validation_counts":dict(validation),
      "proposed_training_counts":dict(training),
      "source_count":len(datasets),
      "source_class_counts":{s:dict(c) for s,c in sorted(datasets.items())},
      "collection_year_counts":dict(sorted(years.items())),
      "collection_date_issues":dict(dates),
      "five_degree_grid_cells":len(geographies),
      "readiness":{
         "labels":valid>0,
         "official_test_preserved":True,
         "satellite_features_joined":False,
         "source_licenses_verified":False,
         "model_trained":False,
         "independent_metrics_available":False
      },
      "limitations":[
        "Validation split is a candidate only; source imbalance, geography and temporal leakage require review.",
        "Duplicate location/date keys may represent legitimate overlapping source labels.",
        "CropHarvest crop/non-crop labels are not crop-health disease or yield labels.",
        "Do not train/evaluate with official test records; no satellite features are attached.",
        "Review per-source licenses before redistributing individual labels."
      ]
    }
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"report":str(out),"total":total,"valid":valid,"invalid":total-valid,
      "official_test":official_test,"candidate_training":sum(training.values()),
      "candidate_validation":sum(validation.values()),"validation_sources":len(selected),
      "duplicate_keys":duplicates,"ready_for_training":False},indent=2))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--labels",type=Path,default=Path(".local/datasets/reference/cropharvest/labels.geojson"))
    p.add_argument("--output",type=Path,default=Path(".local/datasets/reference/cropharvest/full-qa.json"))
    a=p.parse_args()
    if not a.labels.is_file():p.error("CropHarvest labels missing")
    audit(a.labels,a.output)

if __name__=="__main__":main()
