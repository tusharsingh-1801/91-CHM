# Wheat and rice leaf-disease experiments: plan declared before training

Declared 2026-11-20, before any wheat/rice model was trained. Research only; nothing here goes into the app.

## Data (all CC BY 4.0, verified through DataCite; see datasets/TRAINING-DATA-REGISTER.md)
- Wheat leaf rust, IARI India (Mendeley th422bg4yd): 859 photos, Healthy / Leaf rust. Split 602/129/128 by duplicate group.
- Rice leaf disease, Bangladesh (Mendeley kx9rx8p2mz): 1,516 photos, 4 classes. Split 875/228/227 by duplicate group.
- The publisher's own split is ignored (wheat: 3 duplicate groups cross it).

## Models (MobileNetV2, 224 px, strong phone-photo augmentation, cosine LR, seed 42, no ImageNet weights)
- A. scratch: random initialisation, 80 epochs.
- B. transfer: feature layers from our own PLDD-UP run 4 model (trained on legal CC BY potato data), new classifier head, 80 epochs.
- The checkpoint is chosen by validation loss only. The test split is evaluated once per model.

## Reading rule (fixed now)
1. Transfer (B) is called better than scratch (A) only if test accuracy is higher by at least 2.0 points AND macro-F1 is higher.
   Otherwise the report says transfer did not help on that dataset.
2. Test sets are small (128 wheat, 227 rice): a 95% interval on accuracy is about +/-4 to +/-7 points, so differences under that are noise
   and will be reported as such, whatever the point estimates look like.
3. No result here is app-ready. App use still requires the app's own expert-labelled field photos, which we do not yet have.
   Rice photos are from Bangladesh, so rice results say nothing about Indian fields.

## Addendum, declared 2026-11-20 before training on this dataset
- Third dataset: Rice Leaf Disease and Pest Dataset (Mendeley vwv3nry3wr, CC BY 4.0 via DataCite, file SHA-256 matched), **original photos only**
  (the augmented copies are excluded so augmented twins cannot straddle splits). The 16-photo "Rice" folder is excluded (ambiguous label, too small to test).
  7 classes (Healthy, Insect, Leaf scald, Rice Blast, Rice Leaffolder, Rice Stripes, Rice Tungro); 2,747 usable photos; split 1,924/412/411 by duplicate group.
- Same two models (scratch vs transfer from PLDD-UP run 4), same 80 epochs, same reading rule (>= 2.0 points accuracy and higher macro-F1), same caveats.
- Test set is 411 photos, 95% interval about +/-2 to +/-3 points on accuracy. Per-class results for the small classes (about 35-40 test photos) are noisy.
- Country and domain of these rice photos are not stated in the record; no claim is made about Indian fields.

## Addendum 2, declared 2026-11-20 before training: wheat nitrogen deficiency (India)
- Dataset: Wheat nitrogen deficiency (Mendeley th422bg4yd, file Ndeficient.zip, IARI Delhi, CC BY 4.0 via DataCite, file SHA-256 matched). 600 photos:
  Nitrogen sufficient 300 / Nitrogen deficient 300; split 420/90/90 by duplicate group (65 near-duplicate groups, all kept inside one split).
- This is a nutrient-stress task, not a disease. Same two models (scratch vs transfer from PLDD-UP run 4), 80 epochs, same reading rule (>= 2.0 points and higher macro-F1).
- Test set is 90 photos: 95% interval about +/-5 to +/-7 points; any difference below that is noise. One experimental plot setup (Sony IMX363, one field season): no claim about other farms.

## Addendum 3, declared 2026-11-20 before training: Indian rice (Sethy et al. 2020, Mendeley fwcj7stb8r)
- 5,932 photos, 4 classes (Bacterial blight, Blast, Brown spot, Tungro), CC BY 4.0, SHA-256 verified. Split 4,153/890/889 by hash-duplicate group
  (1,365 groups with more than one photo).
- **Provisional.** The duplicate hash does not catch flipped or rotated copies, so copies of one photo may sit in both train and test and inflate the test score.
  The split will be rebuilt with a flip/rotation-proof duplicate check later; until then every number from this dataset is labelled provisional and must not be quoted as accuracy.
- Same two models (scratch vs transfer from PLDD-UP run 4), 80 epochs, same reading rule (>= 2.0 points and higher macro-F1).

## Addendum 4, declared 2026-11-20 before the second Indian-rice training: leak-free split
- The first (provisional) run scored 100% (scratch) and 99.9% (transfer) because 97% of its test photos had a near copy in the training set.
  Those numbers are void and are kept in the report only as the demonstration of the leak.
- New split: duplicate check over all 8 flips/rotations of every photo, near-duplicate distance <= 12% of 1,024 hash bits (`--dihedral --near-duplicate-fraction 0.12`).
  Measured afterwards: no test photo has a training photo within 10% (0.5% within 15%); before, 97% were within 5%.
- Finding: the 5,932 photos fall into only 400 duplicate groups (about 15 per group, largest 60): the set is roughly 400 original photos augmented about 15 times.
  The honest sample size is therefore about 400 independent photos, about 60 independent test groups; 95% intervals on accuracy are wide (several points) and per-class numbers are noisier still.
- Same two models, 80 epochs, same reading rule (>= 2.0 points and higher macro-F1). Split 4,1xx / ~890 / ~890 by group.
