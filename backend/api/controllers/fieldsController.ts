import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';
import {actor,authRequired} from '../services/auth.ts';
import { assessEvidence, vegetationScore, type Observation } from '../../../shared/evidence.ts';
import { evidencePolicy } from '../services/policy.ts';
import { processScene, processLatest, ProcessingError, rasterPayload, EARTH_ENGINE_SOURCE } from '../services/satellite.ts';

const DEFAULT_PYTHON_ENGINE_URL = 'http://127.0.0.1:8000';

export function getPythonEngineUrl(): string {
  return (process.env.PYTHON_ENGINE_URL ?? DEFAULT_PYTHON_ENGINE_URL).replace(/\/+$/, '');
}

export function isValidFieldBoundary(boundary: unknown): boundary is { type: 'Polygon'; coordinates: number[][][] } {
  if (!boundary || typeof boundary!=='object') return false;
  const candidate=boundary as {type?:unknown;coordinates?:unknown};
  if (candidate.type!=='Polygon'||!Array.isArray(candidate.coordinates)||!candidate.coordinates.length||candidate.coordinates.length>50) return false;
  let points=0;
  return candidate.coordinates.every((ring:unknown)=>{
    if(!Array.isArray(ring)||ring.length<4) return false;
    points+=ring.length;
    if(points>5000) return false;
    const valid=ring.every((point:unknown)=>Array.isArray(point)&&point.length===2&&typeof point[0]==='number'&&typeof point[1]==='number'&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90);
    return valid&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1];
  });
}

export function calculateHealthScore(ndvi: number, ndmi: number | null, _validCoverage?: number) {
  return vegetationScore(ndvi, ndmi);
}

export async function getFields(_request: Request, response: Response) {
  try {
    const policy = evidencePolicy();
    const result = await pool.query(`
      select fields.*, ST_Y(location) as latitude, ST_X(location) as longitude,
        ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson,
        coalesce(evidence.observations,'[]'::jsonb) as evidence,
        coalesce(activity.processing,'[]'::jsonb) as processing,
        latest_job.job as "latestJob",
        (select count(*)::int from field_tasks t where t.field_id=fields.id and t.status<>'resolved' and t.due_on<=current_date) as "dueTasks"
      from public.fields
      left join lateral (
        select jsonb_agg(vi order by vi.observed_on desc) as observations from (
          select distinct on (observed_on) * from public.vegetation_indices
          where field_id=fields.id and boundary_version=fields.boundary_version and accepted
            and provenance='measured_imagery' and valid_coverage_percent >= $1 and valid_pixel_count >= $2
          order by observed_on desc,acquired_at desc,scene_id desc limit 2
        ) vi
      ) evidence on true
      left join lateral (
        select jsonb_agg(s) as processing from (
          select scene_id,processing_status,processing_error,valid_coverage_percent,valid_pixel_count
          from public.satellite_scenes where field_id=fields.id and processing_boundary_version=fields.boundary_version
          order by processing_started_at desc nulls last limit 3
        ) s
      ) activity on true
      left join lateral (
        select jsonb_build_object('id',j.id,'field_id',j.field_id,'boundary_version',j.boundary_version,'kind',j.kind,'status',j.status,'progress',j.progress,'result',j.result,'error',j.error,'created_at',j.created_at,'finished_at',j.finished_at) as job
        from ingestion_jobs j where j.field_id=fields.id and j.boundary_version=fields.boundary_version and j.kind='satellite'
        order by j.created_at desc limit 1
      ) latest_job on true
      where fields.provenance not in ('demo','public_boundary')
        and (not $4::boolean or fields.owner_id=$3::uuid)
      order by fields.created_at asc`, [policy.minCoverage,policy.minPixels,actor(response)?.id??null,authRequired()]);
    response.json(result.rows.map((row: Record<string, unknown> & { evidence: Observation[] }) => {
      const [latest,previous] = row.evidence;
      const assessment = assessEvidence(latest??null,previous??null,policy);
      if (!latest && (row.processing as Array<{processing_status:string}>).some(scene=>scene.processing_status==='rejected')) {
        assessment.state='not_enough_data'; assessment.title='Not enough usable data';
        assessment.explanation='The available images did not meet field-level quality requirements.';
        assessment.nextAction='Try another image';
      }
      // Legacy stored scores/dates remain in the database, but cannot masquerade as verified evidence.
      return {...row, boundary_geom:undefined, health_delta:latest&&previous&&latest.calculation_version===previous.calculation_version?Number(latest.ndvi_value)-Number(previous.ndvi_value):null, health_score:latest ? vegetationScore(Number(latest.ndvi_value),latest.ndmi_value==null?null:Number(latest.ndmi_value)) : null,
        ndvi_average:latest?.ndvi_value??null, last_observation:latest?.observed_on??null,
        latestObservation:latest??null,previousObservation:previous??null,assessment,policy};
    }));
  } catch {
    console.error('GET /api/fields failed:');
    response.status(503).json({ error: 'Fields are temporarily unavailable. Check local services and retry.' });
  }
}

export async function getFieldAlerts(request: Request, response: Response) {
  try {
        const result = await pool.query('select id,title,severity,observed_at,resolved,action_status,scene_id,boundary_version,interpretation,ST_AsGeoJSON(stress_geom)::jsonb as stress_geojson from public.alerts where field_id=$1 and boundary_version=(select boundary_version from fields where id=$1) order by observed_at desc', [request.params.fieldId]);
    response.json(result.rows);
  } catch {
    console.error('GET /api/fields/:fieldId/alerts failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function resolveFieldAlert(request: Request, response: Response) {
  try {
    const result = await pool.query(
      `update public.alerts set resolved = true, action_status='resolved'
       where id = $1 and field_id = $2 and boundary_version=(select boundary_version from fields where id=$2)
       returning id, resolved, action_status`,
      [request.params.alertId, request.params.fieldId]
    );
    if (!result.rowCount) { response.status(404).json({ error: 'Alert not found' }); return; }
    response.json(result.rows[0]);
  } catch {
    console.error('PATCH field alert failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function updateFieldAlert(request:Request,response:Response){
  const status=request.body?.status;
  if(!['open','acknowledged','action_taken','resolved'].includes(status)){response.status(400).json({error:'Choose open, acknowledged, action taken or resolved'});return;}
  try{
    const result=await pool.query(`update alerts set action_status=$3,resolved=($3='resolved')
      where id=$1 and field_id=$2 and boundary_version=(select boundary_version from fields where id=$2)
      returning id,resolved,action_status`,[request.params.alertId,request.params.fieldId,status]);
    if(!result.rowCount){response.status(404).json({error:'Alert not found or no longer matches this boundary version'});return;}
    response.json(result.rows[0]);
  }catch {console.error('PATCH field alert status failed:');response.status(503).json({error:'Alert status could not be updated'});}
}

export async function getFieldNdvi(request: Request, response: Response) {
  try {
    const result = await pool.query('select vi.*,ST_AsGeoJSON(inspection_geom)::jsonb as inspection_geojson from public.vegetation_indices vi where field_id = $1 order by observed_on asc,acquired_at asc', [request.params.fieldId]);
    response.json(result.rows);
  } catch {
    console.error('GET /api/fields/:fieldId/ndvi failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function getFieldNdviAnalysis(request: Request, response: Response) {
  const languageCode = request.query.language === 'hi-IN' ? 'hi-IN' : 'en-IN';
  try {
    const fieldResult = await pool.query('select planting_date, harvest_date from public.fields where id = $1', [request.params.fieldId]);
    const field = fieldResult.rows[0];
    if (!field) { response.status(404).json({ error: 'Field not found' }); return; }
    
    const policy=evidencePolicy();
    const result = await pool.query(`select distinct on (observed_on) observed_on,ndvi_value,cloud_cover,source,scene_id from public.vegetation_indices where field_id=$1 and accepted and provenance='measured_imagery' and boundary_version=(select boundary_version from fields where id=$1) and calculation_version in ('sentinel-reflectance-scl-v2','gee-sentinel-reflectance-scl-v1') and valid_coverage_percent >= $2 and valid_pixel_count >= $3 order by observed_on asc,acquired_at desc,scene_id desc`, [request.params.fieldId,policy.minCoverage,policy.minPixels]);
    
    const engineResponse = await fetch(`${getPythonEngineUrl()}/analyze-indices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        languageCode, 
        plantingDate: field.planting_date ?? null,
        harvestDate: field.harvest_date ?? null,
        observations: result.rows
      }),
      signal: AbortSignal.timeout(15000)
    });
    
    if (!engineResponse.ok) {
      console.error('Python engine NDVI analysis failed:', engineResponse.status);
      response.status(503).json({ error: 'Python NDVI analysis is unavailable' });
      return;
    }
    
    const analysis = await engineResponse.json() as Record<string, unknown>;
    response.json({ ...analysis, languageCode, source: 'Descriptive NDVI change over elapsed days; not a crop forecast' });
  } catch {
    console.error('GET NDVI analysis failed:');
    response.status(503).json({ error: 'NDVI analysis is unavailable' });
  }
}


export async function getFieldWeather(request: Request, response: Response) {
  try {
    const result = await pool.query('select * from public.weather_observations where field_id = $1 order by observed_on asc', [request.params.fieldId]);
    response.json(result.rows);
  } catch {
    console.error('GET weather failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function calculateNdviFromScene(request: Request, response: Response) {
  try { response.json(await processScene(String(request.params.fieldId),String(request.params.sceneId))); }
  catch(error) {
    console.error('Scene processing failed:');
    response.status(error instanceof ProcessingError?error.status:503).json({error:error instanceof ProcessingError?error.message:'Image processing unavailable. Please retry.'});
  }
}
export async function processLatestScene(request: Request,response: Response) {
  try { response.json(await processLatest(String(request.params.fieldId))); }
  catch { console.error('Latest scene processing failed:'); response.status(503).json({error:'Image processing unavailable. Please retry.'}); }
}

export async function processNdviSentinelHub(_request: Request, response: Response) {
  response.status(422).json({ error: 'Undated mosaics are not accepted as observations. Select a dated Sentinel-2 scene from Google Earth Engine instead.' });
}

export async function getFieldScenes(request: Request, response: Response) {
  try {
    const result = await pool.query('select * from public.satellite_scenes where field_id = $1 order by observed_at desc, scene_id desc', [request.params.fieldId]);
    response.json(result.rows);
  } catch {
    console.error('GET satellite scenes failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function ingestEarthEngineScenes(request: Request, response: Response) {
  try {
    const fieldResult = await pool.query('select ST_Y(location) as latitude, ST_X(location) as longitude, ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson from public.fields where id = $1', [request.params.fieldId]);
    const field = fieldResult.rows[0];
    if (field?.latitude == null || field?.longitude == null || !field.boundary_geojson) { response.status(400).json({ error: 'A field boundary is required' }); return; }
    const catalogUrl = 'https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED';
    
    const policy = evidencePolicy();
    const days = Number(request.query.days ?? policy.searchDays);
    if (!Number.isInteger(days) || days<1 || days>365) { response.status(400).json({error:'Choose a search range of 1–365 days'}); return; }
    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const startDate = new Date(Date.now() - days * 86400000);
    const engineResponse = await fetch(`${getPythonEngineUrl()}/earth-engine/scenes`, {
      signal: AbortSignal.timeout(180000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygonGeojson: field.boundary_geojson,
        start: startDate.toISOString().slice(0, 10),
        end: endDate.toISOString().slice(0, 10),
        limit: Math.min(policy.candidateLimit, 20),
      }),
    });
    if (!engineResponse.ok) {
      response.status(engineResponse.status === 503 ? 503 : 502).json({
        error: engineResponse.status === 503
          ? 'Google Earth Engine is not configured. Set EARTH_ENGINE_PROJECT_ID and configure ADC for the engine service.'
          : 'Google Earth Engine Sentinel-2 search failed.',
      });
      return;
    }
    const catalog = await engineResponse.json() as { scenes?: Array<{ id: string; image_id: string; observed_at: string; cloud_cover: number | null }> };
    let imported = 0;
    for (const scene of catalog.scenes ?? []) {
      if (!scene.id || !scene.image_id || !Number.isFinite(Date.parse(scene.observed_at))) continue;
      const sceneId = `gee-${scene.id}`;
      await pool.query('insert into public.satellite_scenes (field_id, scene_id, collection, observed_at, cloud_cover, source, catalog_url, assets) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (field_id, scene_id) do update set cloud_cover = excluded.cloud_cover, assets = excluded.assets, source=excluded.source, catalog_url=excluded.catalog_url', [request.params.fieldId, sceneId, 'COPERNICUS/S2_SR_HARMONIZED', scene.observed_at, scene.cloud_cover, EARTH_ENGINE_SOURCE, catalogUrl, JSON.stringify({earth_engine:{image_id:scene.image_id}})]);
      imported += 1;
    }
    response.json({ source: EARTH_ENGINE_SOURCE, catalogUrl, imported });
  } catch {
    console.error('POST Earth Engine Sentinel-2 ingestion failed:');
    response.status(503).json({ error: 'Earth Engine scene ingestion failed. Check engine logs and ADC configuration.' });
  }
}

export const ingestSentinelScenes = ingestEarthEngineScenes;

export async function ingestWeather(request: Request, response: Response) {
  const { start, end } = (request.body ?? {}) as { start?: string; end?: string };
  try {
    const fieldResult = await pool.query('select ST_Y(location) as latitude, ST_X(location) as longitude from public.fields where id = $1', [request.params.fieldId]);
    const field = fieldResult.rows[0];
    if (field?.latitude == null || field?.longitude == null) { response.status(400).json({ error: 'Field latitude and longitude are required' }); return; }
    const from = start ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
    // NASA POWER meteorology is delayed by 2–3 days.
    const to = end ?? new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
    const sourceUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M,RH2M&community=AG&longitude=${field.longitude}&latitude=${field.latitude}&start=${from}&end=${to}&format=JSON`;
    const sourceResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) });
    if (!sourceResponse.ok) { response.status(502).json({ error: 'NASA POWER request failed' }); return; }
    const payload = await sourceResponse.json() as { header?: { fill_value?: number }; properties: { parameter: Record<string, Record<string, number>> } };
    const parameters = payload.properties.parameter;
    const fillValue = payload.header?.fill_value ?? -999;
    const measured = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value !== fillValue ? value : null;
    let imported = 0;
    for (const date of Object.keys(parameters.T2M ?? {})) {
      const precipitation = measured(parameters.PRECTOTCORR?.[date]);
      const temperature = measured(parameters.T2M?.[date]);
      const humidity = measured(parameters.RH2M?.[date]);
      if (precipitation === null && temperature === null && humidity === null) continue;
      await pool.query(`insert into public.weather_observations (field_id, observed_on, precipitation_mm, temperature_c, humidity_percent, source_url) values ($1, to_date($2, 'YYYYMMDD'), $3, $4, $5, $6) on conflict (field_id, observed_on, source) do update set precipitation_mm = excluded.precipitation_mm, temperature_c = excluded.temperature_c, humidity_percent = excluded.humidity_percent, source_url = excluded.source_url`, [request.params.fieldId, date, precipitation, temperature, humidity, sourceUrl]);
      imported++;
    }
    response.json({ source: 'NASA POWER', sourceUrl, imported });
  } catch {
    console.error('POST weather ingestion failed:');
    response.status(503).json({ error: 'Weather ingestion failed' });
  }
}

function validCalendarDate(value: unknown): boolean {
  return value===null || (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);
}

export async function createField(request: Request, response: Response) {
  const { name, crop, boundary_geojson, planting_date, harvest_date, provenance } = (request.body??{}) as {name?:string;crop?:string;boundary_geojson?:unknown;planting_date?:string|null;harvest_date?:string|null;provenance?:string};
  const clientKey=request.get?.('Idempotency-Key')||null;
  if (typeof name !== 'string' || !name.trim() || typeof crop !== 'string' || !crop.trim() || !isValidFieldBoundary(boundary_geojson)) {
    response.status(400).json({ error: 'name, crop, and a valid closed Polygon boundary are required. MultiPolygon imports are not supported; use one Polygon per field.' });
    return;
  }
  if(clientKey!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientKey)){response.status(400).json({error:'Idempotency-Key must be a UUID'});return;}
  if ((planting_date!==undefined&&!validCalendarDate(planting_date))||(harvest_date!==undefined&&!validCalendarDate(harvest_date))||(planting_date&&harvest_date&&planting_date>harvest_date)) { response.status(400).json({error:'Use valid planting/harvest dates, or leave them unknown'});return; }
  if(provenance!==undefined&&provenance!=='user_reported') { response.status(400).json({error:'Field provenance must be user-reported'});return; }
  try {
    const result = await pool.query(
      `with boundary as (
         select ST_SetSRID(ST_GeomFromGeoJSON($3::text), 4326) as geom
       )
       insert into public.fields (name, crop, location, boundary_geom, area_hectares, planting_date, harvest_date, provenance, owner_id, client_key)
       select $1, $2, ST_PointOnSurface(geom), geom,
              round((ST_Area(geom::geography) / 10000.0)::numeric, 2), $4, $5, $6, $7, $8
       from boundary
       where ST_IsValid(geom) and ST_GeometryType(geom) = 'ST_Polygon' and ST_Area(geom::geography)>0 and ST_Area(geom::geography)<=100000000
       on conflict(client_key) where client_key is not null do update set client_key=excluded.client_key
       returning id, name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation, ST_Y(location) as latitude, ST_X(location) as longitude, ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson, planting_date, harvest_date, created_at`,
      [name.trim(), crop.trim(), JSON.stringify(boundary_geojson), planting_date ?? null, harvest_date ?? null, provenance??'user_reported',actor(response)?.id??null,clientKey],
    );
    if (!result.rowCount) {
      response.status(400).json({ error: 'Field boundary is not a valid polygon' });
      return;
    }
    response.status(201).json(result.rows[0]);
  } catch {
    console.error('POST /api/fields failed:');
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
  } catch {
    console.error('PATCH field location failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}


export async function updateField(request: Request, response: Response) {
  const { name, crop, planting_date, harvest_date, expected_yield_tons } = request.body as { name?: string; crop?: string; planting_date?: string | null; harvest_date?: string | null; expected_yield_tons?: number | null };
  if ((name !== undefined && (typeof name !== 'string' || !name.trim())) || (crop !== undefined && (typeof crop !== 'string' || !crop.trim()))) {
    response.status(400).json({ error: 'Field name and crop cannot be empty' });
    return;
  }
  if (expected_yield_tons !== undefined && expected_yield_tons !== null && (!Number.isFinite(expected_yield_tons) || expected_yield_tons < 0)) {
    response.status(400).json({ error: 'Expected yield must be a positive number' });
    return;
  }
  if ((planting_date!==undefined&&!validCalendarDate(planting_date))||(harvest_date!==undefined&&!validCalendarDate(harvest_date))) { response.status(400).json({error:'Use valid calendar dates, or leave them unknown'});return; }
  if (planting_date && harvest_date && planting_date > harvest_date) {
    response.status(400).json({ error: 'Harvest date must be after planting date' });
    return;
  }
  try {
    const result = await pool.query(
      `update public.fields 
       set name = coalesce($1, name), 
           crop = coalesce($2, crop), 
           planting_date = case when $7 then $3::date else planting_date end,
           harvest_date = case when $8 then $4::date else harvest_date end,
           expected_yield_tons = case when $9 then $5::numeric else expected_yield_tons end
       where id = $6 
       returning id, name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation, planting_date, harvest_date, expected_yield_tons, ST_Y(location) as latitude, ST_X(location) as longitude, ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson, created_at`, 
      [name, crop, planting_date, harvest_date, expected_yield_tons, request.params.fieldId, planting_date !== undefined, harvest_date !== undefined, expected_yield_tons !== undefined]
    );
    if (!result.rowCount) { response.status(404).json({ error: 'Field not found' }); return; }
    response.json(result.rows[0]);
  } catch {
    console.error('PATCH field failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function deleteField(request: Request, response: Response) {
  try {
    const result = await pool.query('delete from public.fields where id = $1 returning id', [request.params.fieldId]);
    if (!result.rowCount) { response.status(404).json({ error: 'Field not found' }); return; }
    response.status(204).send();
  } catch {
    console.error('DELETE field failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function getFieldEvents(request: Request, response: Response) {
  try {
    const result = await pool.query('select * from public.field_events where field_id = $1 order by event_date desc, created_at desc', [request.params.fieldId]);
    response.json(result.rows);
  } catch {
    console.error('GET field events failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function createFieldEvent(request: Request, response: Response) {
  const { event_type, event_date, notes,client_key } = (request.body??{}) as { event_type?: unknown; event_date?: unknown; notes?: unknown;client_key?:unknown };
  if(typeof event_type!=='string'||!['planting','fertilizer','irrigation','pesticide','scouting','harvest','other','dataset_import'].includes(event_type)||typeof event_date!=='string'||!validCalendarDate(event_date)||(notes!==undefined&&(typeof notes!=='string'||notes.length>4000))||(client_key!==undefined&&(typeof client_key!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_key)))){
    response.status(400).json({error:'Use a valid event type, calendar date and notes under 4,000 characters'});return;
  }
  try {
    const result = await pool.query(
      `insert into public.field_events (field_id, event_type, event_date, notes,client_key) values ($1, $2, $3, $4,$5) on conflict(field_id,client_key) where client_key is not null do update set field_id=excluded.field_id returning *`,
      [request.params.fieldId, event_type, event_date, typeof notes==='string'?notes.trim():null,client_key||null]
    );
    response.status(201).json(result.rows[0]);
  } catch {
    console.error('POST field event failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function deleteFieldEvent(request: Request, response: Response) {
  try {
    const result = await pool.query('delete from public.field_events where id = $1 and field_id = $2', [request.params.eventId, request.params.fieldId]);
    if (!result.rowCount) { response.status(404).json({ error: 'Event not found' }); return; }
    response.status(204).send();
  } catch {
    console.error('DELETE field event failed:');
    response.status(503).json({ error: 'Database unavailable' });
  }
}

export async function getFieldOverlay(request: Request, response: Response) {
  try {
    const { fieldId, sceneId } = request.params;
    const fieldResult = await pool.query('select ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson from public.fields where id = $1', [fieldId]);
    const field = fieldResult.rows[0];
    if (!field || !field.boundary_geojson) { response.status(400).json({ error: 'Field boundary missing' }); return; }
    
    const sceneResult = await pool.query(
      'select assets,source from public.satellite_scenes where field_id = $1 and scene_id = $2',
      [fieldId, sceneId]
    );
    const scene = sceneResult.rows[0];
    if (!scene) { response.status(404).json({ error: 'Scene not found' }); return; }
    
    const assets = scene.assets;
    if (scene.source === EARTH_ENGINE_SOURCE && typeof assets.earth_engine?.image_id === 'string') {
      const engineResponse = await fetch(`${getPythonEngineUrl()}/earth-engine/generate-overlay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: assets.earth_engine.image_id, polygonGeojson: field.boundary_geojson }),
        signal: AbortSignal.timeout(60000),
      });
      if (!engineResponse.ok) { response.status(502).json({ error: 'Earth Engine overlay generation failed.' }); return; }
      response.json(await engineResponse.json());
      return;
    }
    const engineResponse = await fetch(`${getPythonEngineUrl()}/generate-overlay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rasterPayload(assets),
        polygonGeojson: field.boundary_geojson
      }),signal:AbortSignal.timeout(30000)
    });
    
    if (!engineResponse.ok) {
      response.status(502).json({ error: 'Python engine overlay generation failed' });
      return;
    }
    
    const data = await engineResponse.json();
    response.json(data);
  } catch {
    console.error('GET overlay failed:');
    response.status(503).json({ error: 'Overlay generation failed' });
  }
}

export async function getFieldTile(request: Request, response: Response) {
  try {
    const { fieldId, sceneId, z, x, y } = request.params;
    
    const sceneResult = await pool.query(
      `select scenes.assets,scenes.source, ST_AsGeoJSON(fields.boundary_geom)::jsonb as boundary_geojson
       from public.satellite_scenes scenes
       join public.fields fields on fields.id = scenes.field_id
       where scenes.field_id = $1 and scenes.scene_id = $2 and exists(select 1 from vegetation_indices vi where vi.field_id=fields.id and vi.scene_id=scenes.scene_id and vi.boundary_version=fields.boundary_version and vi.accepted and vi.provenance='measured_imagery' and vi.valid_coverage_percent >= $3 and vi.valid_pixel_count >= $4)`,
      [fieldId, sceneId,evidencePolicy().minCoverage,evidencePolicy().minPixels]
    );
    const scene = sceneResult.rows[0];
    if (!scene) { response.status(404).json({ error: 'Scene not found' }); return; }
    
    const assets = scene.assets;
    if (scene.source === EARTH_ENGINE_SOURCE && typeof assets.earth_engine?.image_id === 'string') {
      const engineResponse = await fetch(`${getPythonEngineUrl()}/earth-engine/tiles/${z}/${x}/${y}.png`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: assets.earth_engine.image_id, polygonGeojson: scene.boundary_geojson }),
        signal: AbortSignal.timeout(30000),
      });
      if (!engineResponse.ok) { response.status(502).json({ error: 'Earth Engine tile generation failed.' }); return; }
      response.setHeader('Content-Type', 'image/png');
      response.setHeader('Cache-Control', 'private, max-age=300');
      response.send(Buffer.from(await engineResponse.arrayBuffer()));
      return;
    }
    const redUrl = assets['red']?.href ?? assets['B04']?.href;
    const nirUrl = assets['nir']?.href ?? assets['B08']?.href;
    if (!redUrl || !nirUrl) { response.status(422).json({ error: 'Scene does not contain red and NIR assets' }); return; }
    const engineResponse = await fetch(`${getPythonEngineUrl()}/tiles/${z}/${x}/${y}.png`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rasterPayload(assets),
        polygonGeojson: scene.boundary_geojson
      }),
      signal: AbortSignal.timeout(30_000)
    });
    
    if (!engineResponse.ok) {
      response.status(502).json({ error: 'Python engine tile generation failed' });
      return;
    }
    
    const buffer = await engineResponse.arrayBuffer();
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'no-store');
    response.send(Buffer.from(buffer));
  } catch {
    console.error('GET tile failed:');
    response.status(503).json({ error: 'Tile generation failed' });
  }
}

export async function updateBoundary(request:Request,response:Response){
 const boundary=(request.body as {boundary_geojson?:unknown})?.boundary_geojson;
 if(!isValidFieldBoundary(boundary)){response.status(400).json({error:'Import or draw a closed Polygon with longitude/latitude coordinates. MultiPolygon is not supported; create one field per parcel.'});return;}
 try{
  const result=await pool.query(`with boundary as(select ST_SetSRID(ST_GeomFromGeoJSON($2::text),4326) geom)
   update fields set boundary_geom=geom,location=ST_PointOnSurface(geom),area_hectares=round((ST_Area(geom::geography)/10000)::numeric,2)
   from boundary where fields.id=$1 and ST_IsValid(geom) and ST_Area(geom::geography)>0 and ST_Area(geom::geography)<=100000000 returning fields.id,boundary_version`,[request.params.fieldId,JSON.stringify(boundary)]);
  if(!result.rowCount){response.status(400).json({error:'Invalid boundary: check intersections, coordinate order and area (maximum 10,000 hectares)'});return;}
  await pool.query(`update ingestion_jobs set status='failed',error='Boundary changed. Start analysis for the new boundary.',lease_token=null,finished_at=now() where field_id=$1 and boundary_version<>$2 and status in ('queued','running')`,[request.params.fieldId,result.rows[0].boundary_version]);
  await pool.query(`update alerts set action_status='superseded' where field_id=$1 and boundary_version<>$2 and action_status<>'resolved'`,[request.params.fieldId,result.rows[0].boundary_version]);
  response.json(result.rows[0]);
 }catch {console.error('Database operation failed');response.status(503).json({error:'Boundary could not be saved. Retry.'});}
}
