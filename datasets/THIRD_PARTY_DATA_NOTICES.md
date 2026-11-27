# Third-Party Data Notices — Crop Health Monitoring (CHM)

Last reviewed: 2026-11-27

This file is a release-readiness index, not a legal opinion or a grant of rights. Dataset terms can differ by version, individual file, contributor and download source. A repository-level licence does not override third-party rights. Do not redistribute raw data unless the exact files and rights have been cleared.

## Dataset register

| Dataset / source | Source licence or terms currently recorded | CHM release decision | Required action / attribution |
|---|---|---|---|
| India Data Portal / Directorate of Economics & Statistics (DES), crop-wise area/production/yield | ODC-Attribution (ODC-By) in the downloaded dataset manifest | Allowed with attribution, limited to the specific downloaded dataset/version | Retain original source URL, provider, download date and manifest; provide ODC-By attribution and link to licence. Do not generalize this clearance to other government datasets. |
| PlantVillage | Original-author linked Hugging Face card states CC BY-SA 3.0; other mirror metadata conflicts | Raw images: hold, not cleared for CHM redistribution/deployment. **Model weights trained on it (ViT paper, GitHub release `vit-paper-v1.0`): released for research use on 2026-11-27 by the authors' decision** | Confirm authority over every image and resolve licence conflict. If CC BY-SA applies, assess share-alike obligations before distributing adaptations or a dataset. The release states research use only and tells users to check the dataset terms; no PlantVillage images are redistributed. Keep the raw-image hold for the CHM app and any dataset bundle. |
| PlantDoc | Repository declares CC BY 4.0; README describes internet-scraped images | Hold: not cleared for redistribution/deployment | Establish image-level rights and provenance; repo-level licence alone does not establish rights in every photograph. |
| Paddy Doctor — Kaggle Paddy Disease Classification competition | Competition rules refer to CC BY 4.0 and separately restrict access/redistribution to people who formally accepted competition rules | Restricted; do not publish competition data or expose it through a public app | Keep raw files private to eligible competition participants. Do not confuse this with IEEE DataPort Paddy Doctor. |
| MDSD maize leaf severity dataset | Article is CC BY; separate image-dataset licence not established | Blocked pending author confirmation | Obtain dataset-specific licence, image rights, model training, app deployment and redistribution permission. |
| IRDD West Bengal, IEEE DataPort DOI 10.21227/4rmf-gd63 | Primary record says Creative Commons Attribution; exact version not shown and full dataset availability unclear | Hold pending exact version and file-level terms | Confirm exact CC version and licence attached to the actual files obtained. |
| SAGE Crop Calendar (Sacks et al., 2010) | No reuse licence stated on publisher page | Blocked pending written permission | Obtain permission for research, adaptation, app display, commercial use and redistribution. |
| CCFI Agricultural Calendar | Official page carries © 2026 CCFI, all rights reserved | Blocked pending written permission | Obtain permission to reproduce/adapt/display; retain written response. |
| PMFBY New Crop Calendar PDF | PMFBY copyright/website policies require permission for reproduction; third-party material needs separate rights-holder permission | Blocked pending written permission and source-owner confirmation | Identify copyright owner and obtain permission covering extraction, adaptation, app display and redistribution. |
| Agricultural Statistics at a Glance 2024–25, Appendix V | Government publication with copyright notice; no open licence confirmed for the crop-calendar table | Hold pending DA&FW permission/terms | Obtain written terms for extracting/adapting state-wise crop calendar; check any third-party source data. |
| IFA/FAI crop-calendar screenshot | Original publication and rights-holder not identified | Blocked; provenance incomplete | Identify original publication, author and rights holder before use. |
| Crop Production data India (Kaggle iamtapendu) | Primary Kaggle dataset licence not verified | Blocked / do not use | Prefer separately documented DES dataset; do not transfer notebook code licence to dataset. |

## Release rules

1. Keep raw files for blocked/restricted datasets out of public Git history, releases, issue attachments and public app storage.
2. A licence in a research paper, GitHub repository or mirror does not automatically license images embedded in a dataset.
3. For each approved dataset version, retain: source URL, provider/author, exact licence name and version, download date, original licence/terms file, attribution text, and a checksum manifest.
4. Keep derived labels, annotations and model weights separately documented. Do not assume the input dataset licence automatically answers every question about model weights or app deployment.
5. When permission is granted, store the written permission and record scope, duration, attribution, modification, commercial-use and redistribution conditions.
6. This file does not assert that any pending permission email was sent or that any permission was granted.

## Current release gate

**Only the specific India Data Portal / DES dataset version recorded with an ODC-Attribution manifest is presently marked allowed with attribution.** All other rows are held, blocked or restricted as shown above. Re-check terms at the exact source before each public release.
