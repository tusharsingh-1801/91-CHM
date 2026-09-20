import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';

export async function getFields(_request: Request, response: Response) {
  try {
    const result = await pool.query(`
      select id, name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation, 
             planting_date, harvest_date, expected_yield_tons,
             ST_Y(location) as latitude, ST_X(location) as longitude, 
             ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson, created_at 
      from public.fields order by created_at asc
    `);
    response.json(result.rows);
  } catch (error) {
    console.error('GET /api/fields failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function getFieldAlerts(request: Request, response: Response) {
  try {
        const result = await pool.query('select id, title, severity, observed_at, resolved, scene_id, ST_AsGeoJSON(stress_geom)::jsonb as stress_geojson from public.alerts where field_id = $1 order by observed_at desc', [request.params.fieldId]);
    response.json(result.rows);
  } catch (error) {
    console.error('GET /api/fields/:fieldId/alerts failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function getFieldNdvi(request: Request, response: Response) {
  try {
    const result = await pool.query('select * from public.vegetation_indices where field_id = $1 order by observed_on asc', [request.params.fieldId]);
    response.json(result.rows);
  } catch (error) {
    console.error('GET /api/fields/:fieldId/ndvi failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function getFieldNdviAnalysis(request: Request, response: Response) {
  const languageCode = request.query.language === 'hi-IN' ? 'hi-IN' : 'en-IN';
  try {
    const fieldResult = await pool.query('select planting_date, harvest_date from public.fields where id = $1', [request.params.fieldId]);
    const field = fieldResult.rows[0];
    
    const result = await pool.query('select observed_on, ndvi_value, cloud_cover, source, scene_id from public.vegetation_indices where field_id = $1 order by observed_on asc', [request.params.fieldId]);
    
    const engineResponse = await fetch(`${process.env.PYTHON_ENGINE_URL || "http://127.0.0.1:8000"}/analyze-indices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        languageCode, 
        plantingDate: field?.planting_date,
        harvestDate: field?.harvest_date,
        observations: result.rows 
      })
    });
    
    if (!engineResponse.ok) {
      console.error('Python engine NDVI analysis failed:', engineResponse.status);
      response.status(503).json({ error: 'Python NDVI analysis is unavailable' });
      return;
    }
    
    const analysis = await engineResponse.json() as Record<string, unknown>;
    response.json({ ...analysis, languageCode, source: 'scikit-learn LinearRegression' });
  } catch (error) {
    console.error('GET NDVI analysis failed:', error);
    response.status(503).json({ error: 'NDVI analysis is unavailable' });
  }
}


export async function getFieldWeather(request: Request, response: Response) {
  try {
    const result = await pool.query('select * from public.weather_observations where field_id = $1 order by observed_on asc', [request.params.fieldId]);
    response.json(result.rows);
  } catch (error) {
    console.error('GET weather failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function calculateNdviFromScene(request: Request, response: Response) {
  try {
    const sceneResult = await pool.query('select * from public.satellite_scenes where field_id = $1 and scene_id = $2', [request.params.fieldId, request.params.sceneId]);
    const scene = sceneResult.rows[0];
    if (!scene) { response.status(404).json({ error: 'Satellite scene not found' }); return; }
    const assets = scene.assets as Record<string, { href?: string }>;
    if (!assets.red?.href || !assets.nir?.href) { response.status(422).json({ error: 'Scene does not contain red and NIR assets' }); return; }
    const fieldResult = await pool.query('select ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson from public.fields where id = $1', [request.params.fieldId]);
    const polygon = fieldResult.rows[0]?.boundary_geojson;
    if (!polygon || !polygon.coordinates?.length) { response.status(400).json({ error: 'Field boundary is required for NDVI calculation' }); return; }
    
    const engineResponse = await fetch(`${process.env.PYTHON_ENGINE_URL || "http://127.0.0.1:8000"}/calculate-indices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blueUrl: assets.blue?.href,
        redUrl: assets.red.href,
        redEdgeUrl: assets.rededge1?.href,
        nirUrl: assets.nir.href,
        swirUrl: assets.swir16?.href,
        sclUrl: assets.scl?.href,
        polygonGeojson: polygon
      }),
      signal: AbortSignal.timeout(120_000)
    });
    
    if (!engineResponse.ok) {
      const errorText = await engineResponse.text();
      console.error('Python engine NDVI calculation failed:', errorText);
      response.status(422).json({ error: 'Failed to calculate NDVI for the given scene' });
      return;
    }
    
        const { ndvi, ndre, ndmi, savi, evi, validPixels, stressGeojson } = await engineResponse.json() as { ndvi: number, ndre: number | null, ndmi: number | null, savi: number | null, evi: number | null, validPixels: number, stressGeojson?: Record<string, unknown> };
    
    await pool.query(
      'insert into public.vegetation_indices (field_id, observed_on, ndvi_value, ndre_value, ndmi_value, savi_value, evi_value, cloud_cover, source, scene_id) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10) on conflict (field_id, scene_id, observed_on) do update set ndvi_value = excluded.ndvi_value, ndre_value = excluded.ndre_value, ndmi_value = excluded.ndmi_value, savi_value = excluded.savi_value, evi_value = excluded.evi_value, cloud_cover = excluded.cloud_cover',
      [request.params.fieldId, scene.observed_at, ndvi, ndre, ndmi, savi, evi, scene.cloud_cover, 'Copernicus Sentinel-2 Red/NIR/RE/SWIR/Blue', scene.scene_id]
    );
    
    if (stressGeojson) {
      await pool.query(
        'insert into public.alerts (field_id, title, severity, observed_at, stress_geom, scene_id) values ($1, $2, $3, $4, ST_GeomFromGeoJSON($5), $6)',
        [request.params.fieldId, 'Stress Zone Detected', 'high', scene.observed_at, JSON.stringify(stressGeojson), scene.scene_id]
      );
    }
    
    response.json({ sceneId: scene.scene_id, observedAt: scene.observed_at, ndvi, ndre, ndmi, savi, evi, validPixels, source: 'Copernicus Sentinel-2' });
  } catch (error) {
    console.error('POST NDVI calculation failed:', error);
    const message = error instanceof DOMException && error.name === 'TimeoutError' ? 'Python engine request timed out' : 'NDVI calculation failed';
    response.status(message.includes('timed out') ? 504 : 503).json({ error: message });
  }
}

export async function processNdviSentinelHub(request: Request, response: Response) {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret || clientId.startsWith('your-')) { response.status(503).json({ error: 'Sentinel Hub credentials are not configured' }); return; }
  try {
    const fieldResult = await pool.query('select ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson from public.fields where id = $1', [request.params.fieldId]);
    const geometry = fieldResult.rows[0]?.boundary_geojson;
    if (!geometry) { response.status(400).json({ error: 'Field boundary is required' }); return; }
    const tokenResponse = await fetch('https://services.sentinel-hub.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }) });
    if (!tokenResponse.ok) { response.status(502).json({ error: 'Sentinel Hub authentication failed' }); return; }
    const token = await tokenResponse.json() as { access_token: string };
    const processResponse = await fetch('https://services.sentinel-hub.com/api/v1/process', { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: { bounds: { geometry }, data: [{ type: 'sentinel-2-l2a', dataFilter: { maxCloudCoverage: 30 }, processing: { upsampling: 'BILINEAR' } }] }, output: { width: 256, height: 256, responses: [{ identifier: 'default', format: { type: 'image/tiff' } }] }, evalscript: '//VERSION=3\nfunction setup(){return {input:["B04","B08"],output:{bands:1,sampleType:"FLOAT32"}}}\nfunction evaluatePixel(sample){return [(sample.B08-sample.B04)/(sample.B08+sample.B04)]}' }) });
    if (!processResponse.ok) { response.status(502).json({ error: 'Sentinel Hub processing failed' }); return; }
    const { fromArrayBuffer } = await import('geotiff');
    const image = await (await fromArrayBuffer(await processResponse.arrayBuffer())).getImage();
    const raster = await image.readRasters({ interleave: true });
    const values = Array.from(raster as ArrayLike<number>).filter((value) => Number.isFinite(value) && value >= -1 && value <= 1);
    if (!values.length) { response.status(422).json({ error: 'No valid NDVI pixels returned' }); return; }
    const ndvi = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
    await pool.query('insert into public.vegetation_indices (field_id, observed_on, ndvi_value, source) values ($1, current_date, $2, $3)', [request.params.fieldId, ndvi, 'Sentinel Hub Process API / Sentinel-2']);
    response.json({ ndvi, validPixels: values.length, source: 'Sentinel-2 via Sentinel Hub Process API' });
  } catch (error) {
    console.error('POST Sentinel Hub NDVI failed:', error);
    response.status(503).json({ error: 'Sentinel Hub NDVI request failed' });
  }
}

export async function getFieldScenes(request: Request, response: Response) {
  try {
    const result = await pool.query('select * from public.satellite_scenes where field_id = $1 order by observed_at desc', [request.params.fieldId]);
    response.json(result.rows);
  } catch (error) {
    console.error('GET satellite scenes failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function ingestSentinelScenes(request: Request, response: Response) {
  try {
    const fieldResult = await pool.query('select ST_Y(location) as latitude, ST_X(location) as longitude, ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson from public.fields where id = $1', [request.params.fieldId]);
    const field = fieldResult.rows[0];
    if (!field?.latitude || !field.longitude) { response.status(400).json({ error: 'Field coordinates are required' }); return; }
    const point = field.boundary_geojson?.coordinates?.[0] ?? [[field.longitude, field.latitude]];
    const flatCoordinates = point.flat();
    const minLongitude = Math.min(...flatCoordinates.filter((_value: number, index: number) => index % 2 === 0));
    const maxLongitude = Math.max(...flatCoordinates.filter((_value: number, index: number) => index % 2 === 0));
    const minLatitude = Math.min(...flatCoordinates.filter((_value: number, index: number) => index % 2 === 1));
    const maxLatitude = Math.max(...flatCoordinates.filter((_value: number, index: number) => index % 2 === 1));
    const catalogUrl = 'https://earth-search.aws.element84.com/v1/search';
    
    const days = parseInt(request.query.days as string, 10) || 90;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    const datetime = `${startDate.toISOString()}/${endDate.toISOString()}`;

    const catalogResponse = await fetch(catalogUrl, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        collections: ['sentinel-2-l2a'], 
        bbox: [minLongitude, minLatitude, maxLongitude, maxLatitude], 
        datetime, 
        query: { 'eo:cloud_cover': { lt: 40 } }, 
        limit: 10,
        sortby: [{ field: "eo:cloud_cover", direction: "asc" }, { field: "datetime", direction: "desc" }]
      }) 
    });

    if (!catalogResponse.ok) { response.status(502).json({ error: 'Sentinel catalog request failed' }); return; }
    const catalog = await catalogResponse.json() as { features?: Array<{ id: string; collection?: string; properties: { datetime: string; 'eo:cloud_cover'?: number }; assets: Record<string, { href: string; type?: string }> }> };
    let imported = 0;
    for (const scene of catalog.features ?? []) {
      await pool.query('insert into public.satellite_scenes (field_id, scene_id, collection, observed_at, cloud_cover, source, catalog_url, assets) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (field_id, scene_id) do update set cloud_cover = excluded.cloud_cover, assets = excluded.assets', [request.params.fieldId, scene.id, typeof scene.collection === 'string' ? scene.collection : 'sentinel-2-l2a', scene.properties.datetime, scene.properties['eo:cloud_cover'] ?? null, 'Copernicus Sentinel-2 via Earth Search', catalogUrl, JSON.stringify(scene.assets)]);
      imported += 1;
    }
    response.json({ source: 'Copernicus Sentinel-2', catalogUrl, imported });
  } catch (error) {
    console.error('POST Sentinel scene ingestion failed:', error);
    response.status(503).json({ error: 'Sentinel scene ingestion failed' });
  }
}

export async function ingestWeather(request: Request, response: Response) {
  const { start, end } = request.body as { start?: string; end?: string };
  try {
    const fieldResult = await pool.query('select ST_Y(location) as latitude, ST_X(location) as longitude from public.fields where id = $1', [request.params.fieldId]);
    const field = fieldResult.rows[0];
    if (!field?.latitude || !field.longitude) { response.status(400).json({ error: 'Field latitude and longitude are required' }); return; }
    const from = start ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
    const to = end ?? new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const sourceUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M,RH2M&community=AG&longitude=${field.longitude}&latitude=${field.latitude}&start=${from}&end=${to}&format=JSON`;
    const sourceResponse = await fetch(sourceUrl);
    if (!sourceResponse.ok) { response.status(502).json({ error: 'NASA POWER request failed' }); return; }
    const payload = await sourceResponse.json() as { properties: { parameter: Record<string, Record<string, number>> } };
    const parameters = payload.properties.parameter;
    for (const date of Object.keys(parameters.T2M ?? {})) {
      await pool.query(`insert into public.weather_observations (field_id, observed_on, precipitation_mm, temperature_c, humidity_percent, source_url) values ($1, to_date($2, 'YYYYMMDD'), $3, $4, $5, $6) on conflict (field_id, observed_on, source) do update set precipitation_mm = excluded.precipitation_mm, temperature_c = excluded.temperature_c, humidity_percent = excluded.humidity_percent, source_url = excluded.source_url`, [request.params.fieldId, date, parameters.PRECTOTCORR?.[date], parameters.T2M?.[date], parameters.RH2M?.[date], sourceUrl]);
    }
    response.json({ source: 'NASA POWER', sourceUrl, imported: Object.keys(parameters.T2M ?? {}).length });
  } catch (error) {
    console.error('POST weather ingestion failed:', error);
    response.status(503).json({ error: 'Weather ingestion failed' });
  }
}

export async function createField(request: Request, response: Response) {
  const { name, crop, latitude, longitude, boundary_geojson, area_hectares, planting_date, harvest_date } = request.body as any;
  if (!name?.trim() || !crop?.trim()) {
    response.status(400).json({ error: 'name and crop are required' });
    return;
  }
  try {
    const result = await pool.query(
      `insert into public.fields (name, crop, location, boundary_geom, area_hectares, planting_date, harvest_date) 
       values (
         $1, $2, 
         CASE WHEN $3::numeric IS NOT NULL AND $4::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint($4, $3), 4326) ELSE NULL END,
         CASE WHEN $5::jsonb IS NOT NULL THEN ST_GeomFromGeoJSON($5::text) ELSE NULL END,
         $6, $7, $8
       ) 
       returning id, name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation, ST_Y(location) as latitude, ST_X(location) as longitude, ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson, planting_date, harvest_date, created_at`,
      [name.trim(), crop.trim(), latitude ?? null, longitude ?? null, boundary_geojson ? JSON.stringify(boundary_geojson) : null, area_hectares ?? 0, planting_date ?? null, harvest_date ?? null],
    );
    response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/fields failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function updateFieldLocation(request: Request, response: Response) {
  const { latitude, longitude } = request.body as { latitude?: number; longitude?: number };
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90 || typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
    response.status(400).json({ error: 'Valid latitude and longitude are required' });
    return;
  }
  try {
    const result = await pool.query(
      `update public.fields 
       set location = ST_SetSRID(ST_MakePoint($2, $1), 4326) 
       where id = $3 
       returning id, name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation, ST_Y(location) as latitude, ST_X(location) as longitude, ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson, created_at`, 
      [latitude, longitude, request.params.fieldId]
    );
    if (!result.rowCount) { response.status(404).json({ error: 'Field not found' }); return; }
    response.json(result.rows[0]);
  } catch (error) {
    console.error('PATCH field location failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}


export async function updateField(request: Request, response: Response) {
  const { name, crop, planting_date, harvest_date, expected_yield_tons } = request.body as { name?: string; crop?: string; planting_date?: string | null; harvest_date?: string | null; expected_yield_tons?: number | null };
  try {
    const result = await pool.query(
      `update public.fields 
       set name = coalesce($1, name), 
           crop = coalesce($2, crop), 
           planting_date = $3, 
           harvest_date = $4, 
           expected_yield_tons = $5 
       where id = $6 
       returning id, name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation, planting_date, harvest_date, expected_yield_tons, ST_Y(location) as latitude, ST_X(location) as longitude, ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson, created_at`, 
      [name, crop, planting_date, harvest_date, expected_yield_tons, request.params.fieldId]
    );
    if (!result.rowCount) { response.status(404).json({ error: 'Field not found' }); return; }
    response.json(result.rows[0]);
  } catch (error) {
    console.error('PATCH field failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function getFieldEvents(request: Request, response: Response) {
  try {
    const result = await pool.query('select * from public.field_events where field_id = $1 order by event_date desc, created_at desc', [request.params.fieldId]);
    response.json(result.rows);
  } catch (error) {
    console.error('GET field events failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function createFieldEvent(request: Request, response: Response) {
  const { event_type, event_date, notes } = request.body as { event_type?: string; event_date?: string; notes?: string };
  if (!event_type?.trim() || !event_date?.trim()) {
    response.status(400).json({ error: 'event_type and event_date are required' });
    return;
  }
  try {
    const result = await pool.query(
      'insert into public.field_events (field_id, event_type, event_date, notes) values ($1, $2, $3, $4) returning *',
      [request.params.fieldId, event_type.trim(), event_date.trim(), notes?.trim() ?? null]
    );
    response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('POST field event failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function deleteFieldEvent(request: Request, response: Response) {
  try {
    const result = await pool.query('delete from public.field_events where id = $1 and field_id = $2', [request.params.eventId, request.params.fieldId]);
    if (!result.rowCount) { response.status(404).json({ error: 'Event not found' }); return; }
    response.status(204).send();
  } catch (error) {
    console.error('DELETE field event failed:', error);
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function getFieldOverlay(request: Request, response: Response) {
  try {
    const { fieldId, sceneId } = request.params;
    const fieldResult = await pool.query('select ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson from public.fields where id = $1', [fieldId]);
    const field = fieldResult.rows[0];
    if (!field || !field.boundary_geojson) { response.status(400).json({ error: 'Field boundary missing' }); return; }
    
    const sceneResult = await pool.query('select assets from public.satellite_scenes where field_id = $1 and scene_id = $2', [fieldId, sceneId]);
    const scene = sceneResult.rows[0];
    if (!scene) { response.status(404).json({ error: 'Scene not found' }); return; }
    
    const assets = scene.assets;
    const engineResponse = await fetch(`${process.env.PYTHON_ENGINE_URL || "http://127.0.0.1:8000"}/generate-overlay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redUrl: assets['red']?.href ?? assets['B04']?.href,
        nirUrl: assets['nir']?.href ?? assets['B08']?.href,
        polygonGeojson: field.boundary_geojson
      })
    });
    
    if (!engineResponse.ok) {
      response.status(502).json({ error: 'Python engine overlay generation failed' });
      return;
    }
    
    const data = await engineResponse.json();
    response.json(data);
  } catch (error) {
    console.error('GET overlay failed:', error);
    response.status(503).json({ error: 'Overlay generation failed' });
  }
}

export async function getFieldTile(request: Request, response: Response) {
  try {
    const { fieldId, sceneId, z, x, y } = request.params;
    
    const sceneResult = await pool.query('select assets from public.satellite_scenes where field_id = $1 and scene_id = $2', [fieldId, sceneId]);
    const scene = sceneResult.rows[0];
    if (!scene) { response.status(404).json({ error: 'Scene not found' }); return; }
    
    const assets = scene.assets;
    const engineResponse = await fetch(`${process.env.PYTHON_ENGINE_URL || "http://127.0.0.1:8000"}/tiles/${z}/${x}/${y}.png`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redUrl: assets['red']?.href ?? assets['B04']?.href,
        nirUrl: assets['nir']?.href ?? assets['B08']?.href
      })
    });
    
    if (!engineResponse.ok) {
      response.status(502).json({ error: 'Python engine tile generation failed' });
      return;
    }
    
    const buffer = await engineResponse.arrayBuffer();
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'public, max-age=86400');
    response.send(Buffer.from(buffer));
  } catch (error) {
    console.error('GET tile failed:', error);
    response.status(503).json({ error: 'Tile generation failed' });
  }
}
