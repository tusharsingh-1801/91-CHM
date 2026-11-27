# Verified dataset licences

Audit note added: 2026-11-27  
Repository: `tusharsingh-1801/91-CHM`  
Related full register: [TRAINING-DATA-REGISTER.md](./TRAINING-DATA-REGISTER.md)

This file is a short list of datasets whose licence was recorded as checked against a primary dataset record or publisher record in the project register. **A verified licence is not the same as a blanket approval to redistribute the dataset or to use it in every part of the product.** Follow the restrictions and intended-use notes below. Keep downloaded data outside Git (the project's `.local/datasets/` directory is git-ignored); do not commit image archives or private field data.

## Verified records

| Dataset | Licence recorded | Permission / restriction to observe | Primary record |
|---|---|---|---|
| PLDD-UP — Potato Leaf Disease Dataset, Uttar Pradesh | CC BY 4.0 | Attribution required. Local source manifest and checksum were recorded in the full register; retain the DOI and licence with the data/model card. | [Mendeley Data, DOI 10.17632/3j4nfkvp2n.1](https://data.mendeley.com/datasets/3j4nfkvp2n/1) |
| AgriFieldNet India Competition Dataset | CC BY 4.0 | Attribution required. Crop-type / Sentinel-2 reference data; it is not a plant-disease image dataset. | [Radiant Earth / Source Cooperative, DOI 10.34911/rdnt.wu92p1](https://source.coop/radiantearth/agrifieldnet-competition) |
| Paddy Doctor (IEEE DataPort record; **not** the Kaggle Paddy Doctor competition dataset) | CC BY 4.0 | Attribution required. IEEE DataPort record is marked **Standard Dataset, Subscription Required**; not downloaded in this project. The GitHub Apache-2.0 licence applies to code, not the images. | [IEEE DataPort, DOI 10.21227/hz4v-af08](https://ieee-dataport.org/node/10108) |
| Wheat nitrogen deficiency and leaf rust (IARI) | CC BY 4.0 | Attribution required. File checksum was recorded as matching the publisher's list; used only in small-crop experiments per the full register. | [Mendeley Data, DOI 10.17632/th422bg4yd.1](https://data.mendeley.com/datasets/th422bg4yd) |
| UCI Rice Leaf Diseases | CC BY 4.0 | Attribution required. Small, white-background dataset; use only for sanity checks, not as evidence of field performance. | [UCI Machine Learning Repository, DOI 10.24432/C5R013](https://archive.ics.uci.edu/dataset/486/rice+leaf+diseases) |
| RiceLeafBD (Mendeley dataset `sjkptpgv79`) | CC BY 4.0 | Attribution required. Bangladesh-origin data; results do not establish performance on Indian fields. | [Mendeley Data, DOI 10.17632/sjkptpgv79.1](https://data.mendeley.com/datasets/sjkptpgv79) |
| Rice leaf disease images, Sethy et al. (Mendeley `fwcj7stb8r`, v2) | CC BY 4.0 | Attribution required. Near-duplicate groups were found; prevent leakage by grouping near-duplicates before splitting. | [Mendeley Data](https://data.mendeley.com/datasets/fwcj7stb8r) |
| Dhan-Shomadhan (Mendeley `znsxdctwtt`, v1) | CC BY 4.0 | Attribution required. Bangladesh-origin data. The project register records the dataset licence as verified, but notes that some collection details and per-class counts remain unconfirmed. | [Mendeley Data, DOI 10.17632/znsxdctwtt.1](https://data.mendeley.com/datasets/znsxdctwtt/1) |
| Database of Leaf Images for Plant Conservation (Mendeley `hb74ynkjcn`, v5) | CC BY 4.0 | Attribution required. Licence verified; not a useful disease-training source for the project's staple field crops (closed-environment images, non-staple species). | [Mendeley Data, DOI 10.17632/hb74ynkjcn.5](https://data.mendeley.com/datasets/hb74ynkjcn/5) |
| Telangana Crop Health Challenge (Zindi) | CC BY-SA 4.0 | Share-alike decision is recorded as accepted by the project owner, but scope is limited to **evaluation only** until model-shipping scope is explicitly decided. Do not ship trained weights derived from it under the current decision. | [Zindi competition rules](https://zindi.world/competitions/telangana-crop-health-challenge/rules) |
| TimeSen2Crop (Zenodo record 4715631) | CC BY 4.0 | Attribution required. Licence verified; crop-type time series, not disease/stress labels, so not a disease-diagnosis training source. | [Zenodo record 4715631](https://zenodo.org/records/4715631) |
| UAV multispectral maize water-stress and common-rust dataset (Zenodo v2.0 record 20332029) | CC BY 4.0 | Attribution required. Licence verified; very-high-resolution UAV imagery is not directly comparable to the app's 10 m satellite inputs. | [Zenodo record 20332029](https://zenodo.org/records/20332029) |
| Stage-wise late-blight field images (Zenodo 22059910) | CC BY 4.0 | Attribution required. Images have no per-image labels according to the authors; use only for the unlabelled domain-shift check described in the full register, not supervised training or accuracy claims. | [Zenodo record 22059910](https://zenodo.org/records/22059910) |
| Colour-Mix sheath-blight severity, Kerala (Mendeley `489spnkhp5`) | CC BY 4.0 | Attribution required. Licence verified; single-disease severity grading and not a general disease-recognition dataset. Not downloaded per the full register. | [Mendeley Data](https://data.mendeley.com/datasets/489spnkhp5) |

## Do not treat these as cleared

The following remain excluded from this verified list and must not be silently promoted to approved training data:

- **PlantDoc:** underlying rights for web-collected images are unclear.
- **PlantVillage:** conflicting licence claims; no unambiguous primary dataset licence was established in the register.
- **Maize leaf blight severity (MDSD):** paper licence does not establish the dataset-file licence.
- **Indian Rice Disease Dataset (IRDD):** licence is not clear on the record.
- **CropHarvest:** CC BY-SA 4.0 is recorded, but the project still needs an explicit share-alike decision before use.
- **Kaggle Paddy Doctor competition data:** separate from the IEEE DataPort Paddy Doctor record above. Competition-specific terms must be followed; do not infer its terms from the IEEE record.

## Attribution and handling checklist

1. Keep the source URL, DOI, exact dataset version, licence text, and download date with every local dataset.
2. Include attribution and a licence link in the model card / research report; state any modifications.
3. Do not put downloaded image archives or other third-party dataset files in the public Git repository unless the dataset's terms explicitly permit redistribution.
4. Keep model-training, evaluation-only, reference-only, and excluded uses distinct. A licence being open does not make a dataset suitable for a particular model.
5. Re-check the primary record before commercial release or redistribution; platform terms and dataset versions can change.

For per-dataset provenance, checksums, download status, and detailed project decisions, use the full [training-data register](./TRAINING-DATA-REGISTER.md).
