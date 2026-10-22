#!/usr/bin/env python3
"""Small official-access probes; no field coordinates, global rasters or secret URLs."""
import json
from datetime import datetime,timezone
from pathlib import Path
import urllib.request
import urllib.error
URLS={
 'worldcover':'https://esa-worldcover.s3.amazonaws.com/v200/2021/esa_worldcover_grid.fgb',
 'chirps':'https://data.chc.ucsb.edu/products/CHIRPS/v3.0/daily/final/rnl/',
 'soilgrids':'https://maps.isric.org/mapserv?map=/map/phh2o.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCapabilities',
 'worldcereal':'https://zenodo.org/api/records/7875105',
 'cropharvest':'https://zenodo.org/api/records/10251170',
 'fao-calendar':'https://cropcalendar.apps.fao.org/',
}
results=[]
for provider,url in URLS.items():
    result={'provider':provider,'url':url,'checked_at':datetime.now(timezone.utc).isoformat()}
    try:
        with urllib.request.urlopen(url,timeout=20) as response:
            response.read(1024)
            result.update(status='reachable_metadata_only',http_status=response.status,content_type=response.headers.get('Content-Type'))
    except urllib.error.HTTPError as exc:
        result.update(status='blocked',http_status=exc.code,error=str(exc))
    except (urllib.error.URLError,TimeoutError,OSError) as exc:
        result.update(status='blocked',http_status=None,error=f'{type(exc).__name__}: {exc}')
    results.append(result)
path=Path('.local/datasets/reference/access-report.json');path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
