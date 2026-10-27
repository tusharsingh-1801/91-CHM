import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';
import { qualityReason, vegetationScore, numeric, type Observation } from '../../../shared/evidence.ts';
import { evidencePolicy } from './policy.ts';

interface Asset { href?: string; image_id?: string; earth_engine?: { image_id?: string }; 'raster:bands'?: Array<{ scale?: number; offset?: number; nodata?: number }> }
export interface SatelliteScene {
  scene_id: string; observed_at: string | Date; cloud_cover: number | string | null;
  assets: Record<string, Asset>; source?: string; processing_status?: string;
}
export class ProcessingError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status=status; }
}
export const engineUrl = () => (process.env.PYTHON_ENGINE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const CALCULATION_VERSION = 'sentinel-reflectance-scl-v2';
export const EARTH_ENGINE_CALCULATION_VERSION = 'gee-sentinel-reflectance-scl-v1';
export const EARTH_ENGINE_SOURCE = 'Copernicus Sentinel-2 via Google Earth Engine';
export function rasterPayload(assets: SatelliteScene['assets']) {
  const transforms: Record<string, { scale: number; offset: number }> = {};
  for (const [key, asset] of Object.entries(assets)) {
    const band = asset['raster:bands']?.[0];
    if (band && Number.isFinite(band.scale) && Number.isFinite(band.offset ?? 0)) transforms[key] = { scale: band.scale!, offset: band.offset ?? 0 };
  }
  return { redUrl: assets.red?.href, nirUrl: assets.nir?.href, sclUrl: assets.scl?.href,
    blueUrl: assets.blue?.href, redEdgeUrl: assets.rededge1?.href, swirUrl: assets.swir16?.href, transforms };
}
interface RasterResult {
  ndvi: number; ndre: number | null; ndmi: number | null; savi: number | null; evi: number | null;
  validPixels: number; validCoverage: number; minimum: number; maximum: number; median: number;
  standardDeviation: number; stressGeojson?: Record<string, unknown> | null; affectedCoverage?: number;
}
function validateResult(data: unknown): RasterResult {
  const result = data as RasterResult;
  if (!result || !Number.isFinite(result.ndvi) || result.ndvi < -1 || result.ndvi > 1 || !Number.isInteger(result.validPixels) || result.validPixels < 1 || !Number.isFinite(result.validCoverage) || result.validCoverage < 0 || result.validCoverage > 100) throw new ProcessingError('Raster engine returned invalid measurements');
  for (const key of ['ndre','ndmi','savi','evi'] as const) if (result[key] !== null && !Number.isFinite(result[key])) throw new ProcessingError('Raster engine returned invalid optional measurements');
  return result;
}
export async function processScene(fieldId: string, sceneId: string) {
  const scene = (await pool.query<SatelliteScene>('select * from public.satellite_scenes where field_id=$1 and scene_id=$2', [fieldId,sceneId])).rows[0];
  if (!scene) throw new ProcessingError('Satellite scene not found',404);
  if (!Number.isFinite(new Date(scene.observed_at).getTime()) || new Date(scene.observed_at).getTime()>Date.now()) throw new ProcessingError('Acquisition date is invalid or in the future');
  const field = (await pool.query<{boundary_version:number; boundary_geojson:Record<string,unknown> | null}>('select boundary_version, ST_AsGeoJSON(boundary_geom)::jsonb as boundary_geojson from public.fields where id=$1',[fieldId])).rows[0];
  if (!field?.boundary_geojson) throw new ProcessingError('Save a field boundary first',400);
  const version = field.boundary_version;
  const earthEngineImageId = scene.assets.earth_engine?.image_id;
  const isEarthEngine = scene.source === EARTH_ENGINE_SOURCE;
  const calculationVersion = isEarthEngine ? EARTH_ENGINE_CALCULATION_VERSION : CALCULATION_VERSION;
  const token = randomUUID();
  const claim = await pool.query(`update public.satellite_scenes set processing_status='processing',processing_token=$3,
    processing_boundary_version=$4,processing_started_at=now(),processing_finished_at=null,processing_error=null
    where field_id=$1 and scene_id=$2 and exists(select 1 from public.fields f where f.id=$1 and f.boundary_version=$4) and (processing_status <> 'processing' or processing_started_at < now()-interval '5 minutes') returning scene_id`,[fieldId,sceneId,token,version]);
  if (!claim.rowCount) throw new ProcessingError('This image is already being processed. Refresh shortly.',409);
  try {
    if (isEarthEngine && typeof earthEngineImageId !== 'string') throw new ProcessingError('Earth Engine image reference is unavailable');
    if (!isEarthEngine && (!scene.assets.red?.href || !scene.assets.nir?.href || !scene.assets.scl?.href)) throw new ProcessingError('Required red, NIR, or cloud-mask band is unavailable');
    const engineResponse = await fetch(`${engineUrl()}${isEarthEngine?'/earth-engine/calculate-indices':'/calculate-indices'}`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(isEarthEngine?{imageId:earthEngineImageId,polygonGeojson:field.boundary_geojson}:{...rasterPayload(scene.assets),polygonGeojson:field.boundary_geojson}),signal:AbortSignal.timeout(180000)});
    if (!engineResponse.ok) throw new ProcessingError(engineResponse.status===422 ? 'No usable pixels intersect this field. Try another date.' : 'Image processing service is unavailable',engineResponse.status===422?422:503);
    const result = validateResult(await engineResponse.json());
    const policy = evidencePolicy();
    const reason = qualityReason({ndvi_value:result.ndvi,valid_coverage_percent:result.validCoverage,valid_pixel_count:result.validPixels},policy);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("set local statement_timeout='10s'");
      const current = (await client.query<{boundary_version:number}>('select boundary_version from public.fields where id=$1 for update',[fieldId])).rows[0];
      if (!current) throw new ProcessingError('Field no longer exists',404);
      // Every writer locks the field briefly AFTER raster work. Late jobs cannot move summaries backward.
      const boundaryChanged = current.boundary_version !== version;
      const quality = boundaryChanged ? 'Boundary changed during processing; historical result only' : reason;
      const accepted = !reason;
      const score = vegetationScore(result.ndvi,result.ndmi);
      await client.query(`insert into public.vegetation_indices
        (field_id,observed_on,scene_id,ndvi_value,ndre_value,ndmi_value,savi_value,evi_value,cloud_cover,source,
         valid_pixel_count,valid_coverage_percent,ndvi_min,ndvi_max,ndvi_median,ndvi_stddev,
         boundary_version,acquired_at,accepted,quality_reason,calculation_version,provenance,vegetation_score)
        values ($1,$2::timestamptz at time zone 'UTC',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$2,$18,$19,$20,'measured_imagery',$21)
        on conflict (field_id,scene_id,observed_on,boundary_version) do update set
         ndvi_value=excluded.ndvi_value,ndre_value=excluded.ndre_value,ndmi_value=excluded.ndmi_value,
         savi_value=excluded.savi_value,evi_value=excluded.evi_value,valid_pixel_count=excluded.valid_pixel_count,
         valid_coverage_percent=excluded.valid_coverage_percent,ndvi_min=excluded.ndvi_min,ndvi_max=excluded.ndvi_max,
         ndvi_median=excluded.ndvi_median,ndvi_stddev=excluded.ndvi_stddev,accepted=excluded.accepted,
         quality_reason=excluded.quality_reason,calculation_version=excluded.calculation_version,
         provenance=excluded.provenance,vegetation_score=excluded.vegetation_score,acquired_at=excluded.acquired_at`,
        [fieldId,scene.observed_at,sceneId,result.ndvi,result.ndre,result.ndmi,result.savi,result.evi,
          scene.cloud_cover===null?null:Math.round(Number(scene.cloud_cover)), isEarthEngine?EARTH_ENGINE_SOURCE:'Copernicus Sentinel-2 L2A / Earth Search',
          result.validPixels,result.validCoverage,result.minimum,result.maximum,result.median,result.standardDeviation,
          version,accepted,reason,calculationVersion,score]);
      await client.query(`update public.vegetation_indices set inspection_geom=case when $4::text is null then null else ST_Multi(ST_GeomFromGeoJSON($4)) end, affected_coverage_percent=$5 where field_id=$1 and scene_id=$2 and boundary_version=$3`,[fieldId,sceneId,version,result.stressGeojson?JSON.stringify(result.stressGeojson):null,result.affectedCoverage??null]);
      if (!boundaryChanged) {
        // Recompute from accepted, distinct acquisition days, never completion order or previous stored score.
        const latestRows = (await client.query<Observation & {vegetation_score:number}>(`select distinct on (observed_on) * from public.vegetation_indices
          where field_id=$1 and boundary_version=$2 and accepted and provenance='measured_imagery'
            and valid_coverage_percent >= $3 and valid_pixel_count >= $4
          order by observed_on desc,acquired_at desc,scene_id desc limit 2`,[fieldId,version,policy.minCoverage,policy.minPixels])).rows;
        const [latest,previous] = latestRows;
        if (latest) {
          const comparable = previous?.calculation_version === latest.calculation_version;
          const declined = comparable && numeric(latest.ndvi_value)!-numeric(previous!.ndvi_value)! <= -policy.declineThreshold;
          const currentEvidenceKey=declined?`decline:${version}:${latest.scene_id}`:null;
          await client.query(`update public.alerts set action_status='superseded'
            where field_id=$1 and boundary_version=$2 and evidence_key like 'decline:%'
              and action_status in ('open','acknowledged','action_taken')
              and ($3::text is null or evidence_key<>$3)`,[fieldId,version,currentEvidenceKey]);
          await client.query(`update public.fields set health_score=$2,ndvi_average=$3,last_observation=$4,
            latest_observed_at=$5,latest_scene_id=$6,health_delta=$7 where id=$1`,
            [fieldId,latest.vegetation_score,latest.ndvi_value,latest.observed_on,latest.acquired_at,latest.scene_id,comparable?latest.vegetation_score-previous.vegetation_score:0]);
          if (declined) {
            await client.query(`insert into public.alerts(field_id,title,severity,observed_at,scene_id,boundary_version,evidence_key,interpretation)
              values($1,'Vegetation decreased — inspect the field','neutral',$2,$3,$4,$5,$6)
              on conflict (field_id,evidence_key) where evidence_key is not null do nothing`,
              [fieldId,latest.acquired_at,latest.scene_id,version,`decline:${version}:${latest.scene_id}`,
                'A decrease between usable images is a scouting signal, not a disease diagnosis. Manual resolution does not verify crop recovery.']);
          }
        }
        await client.query(`update public.satellite_scenes set processing_status=$4,processing_finished_at=now(),
          processing_error=$5,valid_coverage_percent=$6,valid_pixel_count=$7
          where field_id=$1 and scene_id=$2 and processing_token=$3`,[fieldId,sceneId,token,accepted?'processed':'rejected',quality,result.validCoverage,result.validPixels]);
      }
      await client.query('commit');
      return {sceneId,observedAt:scene.observed_at,...result,accepted:accepted&&!boundaryChanged,qualityReason:quality,boundaryVersion:version,healthScore:score,source:isEarthEngine?EARTH_ENGINE_SOURCE:'Copernicus Sentinel-2',calculationVersion};
    } catch(error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  } catch(error) {
    await pool.query(`update public.satellite_scenes set processing_status=$4,processing_error=$5,processing_finished_at=now()
      where field_id=$1 and scene_id=$2 and processing_token=$3`,[fieldId,sceneId,token,error instanceof ProcessingError && error.status===422?'rejected':'failed',error instanceof Error?error.message:'Processing failed']);
    throw error;
  }
}
export async function processLatest(fieldId: string) {
  const policy=evidencePolicy();
  const candidates=(await pool.query<SatelliteScene>(`select * from public.satellite_scenes where field_id=$1
    and observed_at >= now()-($2 * interval '1 day') and observed_at <= now()
    order by observed_at desc,scene_id desc limit $3`,[fieldId,policy.searchDays,policy.maxAttempts])).rows;
  const attempts: Array<{sceneId:string;status:string;reason?:string}> = [];
  for(const scene of candidates) {
    try {
      const result=await processScene(fieldId,scene.scene_id);
      attempts.push({sceneId:scene.scene_id,status:result.accepted?'processed':'rejected',reason:result.qualityReason??undefined});
      if(result.accepted) return {...result,attempts};
    } catch(error) {
      attempts.push({sceneId:scene.scene_id,status:error instanceof ProcessingError && error.status===422?'rejected':'failed',reason:error instanceof Error?error.message:'Processing failed'});
      if(error instanceof ProcessingError && [400,404,409].includes(error.status)) break;
    }
  }
  return {accepted:false,attempts,message:'No usable image accepted. Your last successful observation is unchanged. Try again later or inspect the field.'};
}
