# ViT leaf-disease paper: revision pack for Vikas Sir's comments

Written 2026-11-26. The manuscript and code were not on this machine, so every
`[FILL: ...]` below needs a number or fact from your own notebook. Nothing
here invents a result.

## Title (item 1 chosen)

**Fine-Tuned Vision Transformer for 38-Class Plant Leaf Disease Classification with Attention-Rollout Explanations and Efficiency Benchmarking**

## Problem statement and research question (comment 8)

Paste after the introduction's first paragraph.

> **Problem.** Plant-leaf classifiers trained on PlantVillage routinely report
> accuracy above 99%, yet the dataset contains several photographs of the same
> leaf and background cues that correlate with the label [Noyan 2022]. Reported
> accuracy can therefore overstate how well a model works on unseen leaves, and
> large transformer models are rarely compared with lightweight CNNs on
> deployment cost.
>
> **Research question.** On a leakage-aware split of PlantVillage, does a
> fine-tuned Vision Transformer (ViT) outperform MobileNetV2 on 38-class
> classification, and does the accuracy gain justify its extra parameters and
> inference latency? Secondary question: do attention-rollout maps highlight
> the diseased leaf regions rather than the background?

(Edit "leakage-aware split" to match what you actually did. If you did not
group images by leaf or de-duplicate, say so and use "stratified split".)

## Contributions (comment 1)

Filled with the 2026-11-26 measurements (see the Measured results section).

1. We fine-tune ViT-B/16 (ImageNet-21k pretrained) on 38 PlantVillage classes
   with a near-duplicate-aware split and report 99.89% accuracy and macro F1 of
   0.9976 on 8,155 held-out images (95% CI 99.82-99.95%).
2. We compare it with MobileNetV2 under the same split and budget. The
   0.11-point accuracy difference is not statistically significant (McNemar
   p = 0.078), while ViT costs 85.8 M vs 2.27 M parameters, 343 MB vs 9.3 MB,
   and 223 ms vs 22.8 ms CPU latency per image.
3. We compute attention-rollout maps and test them with a deletion check on 400
   correctly classified images: removing the top-ranked 25% of patches lowers the
   true-class probability about twice as much as removing random patches
   (0.029 vs 0.015). The maps do not concentrate on the leaf more than its area
   share, so we make no localisation claim.
4. We analyse the weakest classes (corn Northern Leaf Blight vs Gray Leaf Spot,
   tomato spider mites vs Target Spot) and the dataset's duplicate and
   background-bias risks, with all 38 classes in Appendix A
   (`per_class_vit_group.tex`).

## Comment-by-comment fixes

**2. Discussion on the repository.** Delete the paragraph. Keep one sentence:
"Code, split lists and weights are released at [FILL: URL/DOI]" and move it to
a Data and Code Availability section.

**3. Macro P = R = F1 = 0.9897.** Check this before submitting. Run:

```python
from sklearn.metrics import precision_recall_fscore_support, accuracy_score, classification_report
y_true, y_pred = ...  # test labels and predictions
print(accuracy_score(y_true, y_pred))
for avg in ("macro", "micro", "weighted"):
    print(avg, precision_recall_fscore_support(y_true, y_pred, average=avg)[:3])
print(classification_report(y_true, y_pred, digits=4))
```

How to read the result:
- If `micro` P = R = F1 = accuracy, that is normal. Micro-averaging always gives
  identical values. Make sure you did not label that number "macro".
- If macro values truly come out equal to 4 decimals, it is possible but rare.
  Report macro, weighted and accuracy in the same table with the number of test
  images, and add per-class support to the appendix.
- Compute macro by hand as the mean of the 38 per-class values to confirm.

**4. Full per-class table.** Add Appendix A with all 38 classes: precision,
recall, F1, support. `classification_report(..., output_dict=True)` to a
DataFrame to LaTeX (`df.to_latex(float_format="%.4f")`). Keep the six weakest
in the main text.

**5. Comparison with published work and related work.** Add a short table of
published results and a related-work paragraph. Candidate references below
(the first block I verified exists; check each citation details yourself
before submitting):

- Dosovitskiy et al., "An Image is Worth 16x16 Words," ICLR 2021 (ViT).
- Sandler et al., "MobileNetV2: Inverted Residuals and Linear Bottlenecks," CVPR 2018.
- Abnar and Zuidema, "Quantifying Attention Flow in Transformers," ACL 2020 (attention rollout, arXiv:2005.00928).
- Hughes and Salathe, "An open access repository of images on plant health," arXiv:1511.08060 (PlantVillage).
- Mohanty, Hughes, Salathe, "Using Deep Learning for Image-Based Plant Disease Detection," Front. Plant Sci. 2016 (arXiv:1604.03169).
- Singh et al., "PlantDoc: A Dataset for Visual Plant Disease Detection," CoDS-COMAD 2020.
- Noyan, "Uncovering bias in the PlantVillage dataset," arXiv:2206.04374 (2022).

Verification (2026-11-26): every entry in `docs/vit-paper/references.bib`
(25 entries) was checked against arXiv or Crossref for title, authors, year and
venue/volume/pages. All matched; one author list I had first guessed was
corrected from Crossref. The earlier "unverified" list is now confirmed, with
two corrections: the Agronomy 2024 paper is Feng, Sun and Zhang, "Plant Disease
Identification Based on Encoder-Decoder Model" (14(10):2208), and the
PlantXViT journal version lists five authors (arXiv v1 lists four).

Numbers confirmed from the abstracts of those papers (use only these):

- Feng et al. 2024: 99.9% on PlantVillage, 97.4% EMBRAPA, 91.5% FGVC8.
- Salman et al. 2025 (ViT + mixture of experts): 68% accuracy PlantVillage to PlantDoc cross-domain, about 20% better than a plain ViT.
- Thakur et al. (PlantXViT): 0.8 M parameters; average accuracy above 93.55% Apple, 92.59% Maize, 98.33% Rice.
- Tonmoy et al. 2025 (MobilePlantViT): 0.69 M parameters, test accuracy 80% to over 99% across datasets.
- Banerjee et al. 2025 survey: hierarchical ViT above 99.3% on plant disease detection.
- Borhani et al. 2022: attention blocks raise accuracy but slow prediction; CNN+ViT hybrid recovers speed (abstract gives no numbers).
- Benabbas et al. 2025: CNNs lose robustness under domain shift, ViTs generalise better, CLIP zero-shot works without task training (abstract gives no numbers).

I could not confirm the "96% to 99%" and "70-87% on PlantDoc" ranges I wrote
earlier, so they are removed. Wording for the comparison:

> Published ViT and hybrid models report PlantVillage accuracy of 99.9% [Feng
> 2024] and above 99.3% [Banerjee 2025], but accuracy falls on field images:
> a ViT with mixture of experts reaches 68% when trained on PlantVillage and
> tested on PlantDoc [Salman 2025]. Our 99.89% on PlantVillage is in the same
> range. Because protocols differ (split, augmentation, pretraining), direct
> ranking is not meaningful, and we did not test cross-dataset transfer.

Related-work paragraph (paste after the comparison):

> Early PlantVillage work applied CNNs [Mohanty 2016, Ferentinos 2018], and
> reviews warned that lab-style images limit field performance [Barbedo 2016].
> PlantDoc was built to test field images [Singh 2020], and a dataset audit found
> background cues that let models classify PlantVillage images from the
> background alone [Noyan 2022]. Vision transformers [Dosovitskiy 2021, Touvron
> 2021] have since been applied to plant disease, alone [Borhani 2022], combined
> with CNNs [Thakur 2023], as lightweight hybrids [Tonmoy 2025], with mixture of
> experts for field data [Salman 2025], or compared with CNNs and CLIP under
> domain shift [Benabbas 2025]; surveys are in [Mehdipour 2025, Banerjee 2025].
> Explanation methods for transformers include attention rollout [Abnar 2020],
> gradient-based relevance [Chefer 2021], and Grad-CAM for CNNs [Selvaraju
> 2017], and attention weights alone are not always faithful explanations [Jain
> 2019]. We add to this by comparing a fine-tuned ViT-B/16 and MobileNetV2 under
> a near-duplicate-aware split, reporting deployment cost and a deletion test of
> the rollout maps.

The bib has 25 entries; 16 are from 2021 onward. Add more 2021+ plant-disease papers only after checking each one the same way.

**6. Unsupported statements.** Either cite or soften:
- "CNNs' localized receptive fields limit performance" becomes "CNNs build
  global context only through depth, whereas self-attention relates all patches
  from the first layer [Dosovitskiy 2021]. In our experiments, [FILL: your
  result]."
- "ViTs capture dispersed symptoms more effectively" becomes "ViT attention
  maps in Fig. [FILL] cover [FILL], but we did not test this against a CNN, so
  we make no claim that ViTs are better at dispersed symptoms." Use this
  version unless you have a CNN explanation comparison (e.g. Grad-CAM on
  MobileNetV2).

**7. Dataset, licence, release.**
- Name the exact source: original PlantVillage (Hughes and Salathe, arXiv:1511.08060) and the Kaggle copy, with its URL, version number and download date. [FILL]
- Licence: state it as written on the dataset page. If the Kaggle page lists no clear licence, say "the redistributed Kaggle copy does not state a clear licence; we do not redistribute images, only file lists."
- Release a CSV with each image path and its train/val/test assignment, the training script, and weights (GitHub plus a Zenodo DOI is the usual way to get a citable DOI).
- Add a short Data and Code Availability section with those links.

**8. Formatting.** Use the IEEE conference template (`\documentclass[conference]{IEEEtran}`),
check the venue's page limit (usually 6 to 8 pages including references),
keep the keyword list, and put the appendix in a supplement if pages run out.

## Still open (need your files)

- The real numbers for every `[FILL]`.
- Whether the split was grouped by leaf. If not, this is the main weakness and
  should be stated as a limitation rather than hidden.
- Recomputed macro metrics (comment 3).

## Measured results (run 2026-11-26, one seed, 3 epochs each, RTX 4050 laptop GPU)

Code: `docs/vit-paper/code/`. Outputs: `C:\work\vit\out\` (metrics.json, per_class_*.csv/.tex, rollout_results.json, fig_rollout.png).
Split: grouped by perceptual hash so near-duplicate photos of one leaf stay together
(54,305 images, 38 classes; train 37,860 / val 8,290 / test 8,155). With a plain random
split 6.9% of test images have a same-group image in train; with the grouped split 0%.
The grouping is approximate (hash threshold 6 bits), so say "near-duplicate-aware", not "leaf-level".

| | ViT-B/16 (augreg in21k->in1k) | MobileNetV2 |
|---|---|---|
| Test accuracy | 0.9989 (95% CI 0.9982-0.9995) | 0.9978 (0.9967-0.9988) |
| Macro P / R / F1 | 0.9980 / 0.9974 / 0.9976 | 0.9965 / 0.9946 / 0.9955 |
| Params | 85.8 M | 2.27 M |
| Size fp32 | 343 MB | 9.3 MB |
| GMACs | 16.9 | 0.31 |
| CPU latency, batch 1 | 223 ms | 22.8 ms |
| GPU latency, batch 1 (fp32) | 12.8 ms | 6.8 ms |
| GPU throughput, batch 64 fp16 | 382 img/s | 1924 img/s |

- **Comment 3 resolved:** macro P, R and F1 are NOT equal in our run (table above), and the by-hand mean of per-class F1 matches sklearn. The 0.9897 in the old manuscript should be recomputed.
- **ViT vs MobileNetV2:** 15 test images ViT gets right and MobileNetV2 wrong, 6 the reverse; McNemar p = 0.078. The 0.1 point gap is **not statistically significant** and the CIs overlap. Do not write "ViT outperforms"; write "comparable accuracy at about 38x the parameters, 11x the CPU latency and 5x lower throughput".
- **Weakest pair:** Corn Northern Leaf Blight vs Gray Leaf Spot (4+1 errors for ViT); also Tomato spider mites vs Target Spot.
- **Attention rollout (400 correctly classified test images):** mean share of attention inside the leaf mask 0.877 vs mask covering 0.885 of the image (median ratio 0.999), so rollout shows **no preference for the leaf over background**; the PlantVillage leaves fill most of the frame, so this check is weak. Deletion test: removing the top 25% rollout patches drops true-class probability by 0.029, vs 0.015 for random and 0.009 for the lowest-ranked, a small but consistent ordering. Wording to use: "rollout ranking is modestly faithful by a deletion test; we do not claim it localises lesions."
- **Limits to state:** single seed, 3 epochs, no cross-dataset test (PlantDoc), approximate grouping, GPU latency measured on a laptop GPU with timing noise (MobileNetV2 fp16 was slower than fp32, so quote fp32 or CPU).
