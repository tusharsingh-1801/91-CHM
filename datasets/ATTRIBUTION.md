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
