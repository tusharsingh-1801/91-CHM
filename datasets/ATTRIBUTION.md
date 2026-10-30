# Public boundary research-sample attribution

The polygons in `demo/ftw-india-sample.geojson` are a three-parcel extract of **Fields of The World: Field Boundaries for India**, distributed by **Kerner Lab / Fields of The World** on Source Cooperative.

- Source: https://source.coop/kerner-lab/fields-of-the-world-india/boundaries_india_2016.parquet
- Original boundary research: Sherrie Wang, Francois Waldner, David B. Lobell, *Unlocking large-scale crop field delineation in smallholder farming systems with transfer learning and weak supervision* (2022), https://doi.org/10.48550/arXiv.2201.04771
- FTW dataset/license listing: https://github.com/fieldsoftheworld/ftw-datasets-list
- License: **Creative Commons Attribution 4.0 International**, https://creativecommons.org/licenses/by/4.0/
- Reference boundary year: **2016**.
- Changes: selected three valid 1–10 hectare polygons as a static research sample; attached source IDs, provenance and explicit unknown-value fields. Polygon coordinates are retained from the source.

The original GeoParquet is not stored in this repository or currently present in the workspace. Its source checksum and size are recorded in `demo/manifest.json`.

These parcels are public historical benchmarks, not the user's farms, and are not imported into the app. Their current crop species, planting/harvest dates, yield, ownership and management activities are not established by this boundary dataset. A current satellite calculation over the historical polygon is an observation over that footprint, not a validation that today's parcel boundary or crop label is unchanged.

## PLDD-UP potato leaf photographs

The local research dataset `.local/datasets/up/pldd-up/` is **PLDD-UP: Potato Leaf Disease Dataset from Uttar Pradesh, India**, published on Mendeley Data:

- Dataset DOI: https://doi.org/10.17632/3j4nfkvp2n.1
- Source: https://data.mendeley.com/datasets/3j4nfkvp2n/1
- License: Creative Commons Attribution 4.0 International (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/
- Contributors shown on the Mendeley record: **Prakash Kumar Singh** and **Aseem Chandel**. Attribute these contributors and cite the Mendeley Data record; retain the DOI and license when redistributing permitted material.
- Local source manifest records the three verified archive SHA-256 checksums. Original archives and extracted images remain unchanged.

The dataset contains 15,519 field-collected leaf photographs: Healthy (4,600), Early Blight (4,803), and Late Blight (6,116), from Mainpuri, Etawah, and Jaswantnagar, Uttar Pradesh. Local pipeline outputs are derived research inventories, split manifests, or trained artifacts; attribution and source-specific terms must accompany any permitted redistribution. CC BY 4.0 does not by itself resolve every downstream model, privacy, or deployment obligation.

These are not satellite observations, satellite-matched field labels, or a validated commercial diagnostic dataset. The images do not establish conditions across all Uttar Pradesh districts or potato varieties. Any model output is experimental and must not be represented as a confirmed diagnosis.
