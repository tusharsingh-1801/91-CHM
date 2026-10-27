import type { Assessment, EvidencePolicy, Observation, Provenance, SceneStatus } from '../../../shared/evidence';
import type { GrowthStage, ObservationCategory, ObservationSeverity } from '../../../shared/inspection';
import type { FieldTask, ProcessingJob } from '../../../shared/workflows';
export type { FieldTask, ProcessingJob, TaskState } from '../../../shared/workflows';
export type { Observation } from '../../../shared/evidence';
export type DatabaseField = {
  id: string
  name: string
  crop: string
  area_hectares: number
  health_score: number | null
  ndvi_average: number | string | null
  canopy_coverage: number
  health_delta: number | null
  last_observation: string | null
  latitude: number | null
  longitude: number | null
  planting_date: string | null
  harvest_date: string | null
  expected_yield_tons: number | null
  boundary_geojson?: Record<string, unknown> | null
  stress_geojson?: Record<string, unknown> | null
  boundary_version?: number
  provenance?: Provenance
  assessment?: Assessment
  policy?: EvidencePolicy
  latestObservation?: Observation | null
  previousObservation?: Observation | null
  latest_scene_id?: string | null
  processing?: Array<{scene_id:string; processing_status:SceneStatus; processing_error:string|null}>
  latestJob?: ProcessingJob | null
  dueTasks?: number
}

export async function loadFields() {
  const response = await fetch('/api/fields')
  if (!response.ok) throw new Error('Unable to load fields')
  return response.json() as Promise<DatabaseField[]>
}

export async function updateField(fieldId: string, updates: { name: string; crop: string; planting_date: string | null; harvest_date: string | null; expected_yield_tons: number | null }) {
  const response = await fetch(`/api/fields/${fieldId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
  const payload = await response.json().catch(() => ({})) as DatabaseField & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? 'Unable to update field')
  return payload
}

export async function updateFieldBoundary(fieldId:string,boundary_geojson:Record<string,unknown>) {
  const response=await fetch(`/api/fields/${fieldId}/boundary`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({boundary_geojson})});
  const payload=await response.json().catch(()=>({})) as {error?:string;boundary_version?:number};
  if(!response.ok)throw new Error(payload.error??'Unable to update field boundary');
  return payload;
}

export async function deleteField(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}`, { method: 'DELETE' })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error ?? 'Unable to delete field')
  }
}

export async function checkApiHealth() {
  const response = await fetch('/api/health')
  if (!response.ok) throw new Error('PostgreSQL API unavailable')
  return response.json() as Promise<{ status: string; database: string }>
}

let assistantRetryAt=0;
export async function askFieldAssistant(message: string, fieldId?: string, languageCode = 'en-IN',saveHistory=false) {
  const wait=Math.ceil((assistantRetryAt-Date.now())/1000);
  if(wait>0)throw new Error(`Please wait ${wait} seconds before retrying this provider.`);
  const response = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, fieldId, languageCode,saveHistory,provider:'gemini' }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    if(response.status===429){
      const header=response.headers.get('Retry-After');
      const delay=header?(/^\d+(\.\d+)?$/.test(header)?Number(header)*1000:Date.parse(header)-Date.now()):60000;
      assistantRetryAt=Date.now()+(Number.isFinite(delay)?Math.max(1000,delay):60000);
    }
    throw new Error(payload.error ?? 'Assistant unavailable')
  }
  return response.json() as Promise<{ answer: string; historySaved?:boolean; model: string; languageCode: string; evidenceDates?:string[] }>
}

export async function ingestWeather(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ingest/weather`, { method: 'POST' })
  const payload = await response.json().catch(() => ({})) as { error?: string; source: string; imported: number }
  if (!response.ok) throw new Error(payload.error ?? 'Weather ingestion failed')
  return payload
}

export async function ingestEarthEngineScenes(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ingest/earth-engine-scenes`, { method: 'POST' })
  const payload = await response.json().catch(() => ({})) as { error?: string; source: string; imported: number }
  if (!response.ok) throw new Error(payload.error ?? 'Earth Engine scene ingestion failed')
  return payload
}

export const ingestSentinelScenes = ingestEarthEngineScenes;

export async function loadScenes(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/scenes`)
  if (!response.ok) throw new Error('Unable to load satellite scenes')
  return response.json() as Promise<SatelliteScene[]>
}

export async function calculateNdvi(fieldId: string, sceneId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ndvi/from-scene/${encodeURIComponent(sceneId)}`, { method: 'POST' })
  const payload = await response.json().catch(() => ({})) as { error?: string; sceneId: string; ndvi: number; validPixels: number; validCoverage: number; healthScore: number; source: string; accepted: boolean; qualityReason: string | null }
  if (!response.ok) throw new Error(payload.error ?? 'NDVI calculation failed')
  return payload
}

export type VegetationIndexObservation = Observation & {
  savi_value: number | string | null; evi_value: number | string | null;
};

export async function loadNdvi(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ndvi`)
  if (!response.ok) throw new Error('Unable to load NDVI observations')
  return response.json() as Promise<VegetationIndexObservation[]>
}

export type NdviAnalysis = {
  status: string
  statusLabel: string
  trend?: 'improving' | 'declining' | 'stable'
  stage?: string | null
  summary: string
  recommendation?: string
  observations: number
  average?: number
  slopePerDay?: number | null
  slopeUnits?: string
  dateStart?: string | null
  dateEnd?: string | null
  volatility?: number
  predictedNext?: number | null
  rSquared?: number | null
  languageCode: string
  source: string
}

export async function loadNdviAnalysis(fieldId: string, languageCode = 'en-IN') {
  const response = await fetch(`/api/fields/${fieldId}/ndvi/analysis?language=${encodeURIComponent(languageCode)}`)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error ?? 'Unable to analyse NDVI')
  }
  return response.json() as Promise<NdviAnalysis>
}
export type FieldEvent = {
  id: string
  field_id: string
  event_type: string
  event_date: string
  notes: string | null
  created_at: string
}

export async function loadFieldEvents(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/events`)
  if (!response.ok) throw new Error('Unable to load field events')
  return response.json() as Promise<FieldEvent[]>
}

export async function createFieldEvent(fieldId: string, event_type: string, event_date: string, notes?: string, client_key?:string) {
  const response = await fetch(`/api/fields/${fieldId}/events`, { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ event_type, event_date, notes,client_key })
  })
  if (!response.ok) throw new Error('Unable to create field event')
  return response.json() as Promise<FieldEvent>
}

export async function deleteFieldEvent(fieldId: string, eventId: string) {
  const response = await fetch(`/api/fields/${fieldId}/events/${eventId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Unable to delete field event')
}

export type ScoutingPhoto = { preview_url?:string; id:string; width:number; height:number; quality:string };
export type ScoutingCase = {
  id:string; observed_on:string; crop:string|null; symptoms:string|null; notes:string|null;
  observation_category:ObservationCategory; growth_stage:GrowthStage; severity:ObservationSeverity;
  provenance:'owner_reported'; verification_status:'unverified'|'expert_verified';
  diagnosis_status:string; diagnosis:Record<string,unknown>; photos:ScoutingPhoto[]; research_consent?:boolean;
};
export async function loadScouting(fieldId:string) {
  const response=await fetch(`/api/fields/${fieldId}/scouting`);
  if(!response.ok)throw new Error('Unable to load scouting notes');
  const payload=await response.json() as {cases?:unknown;diagnosis?:{status:string;provider:string|null;reason:string}};
  if(!Array.isArray(payload.cases))throw new Error('Scouting service returned an invalid response');
  return payload as {cases:ScoutingCase[];diagnosis:{status:string;provider:string|null;reason:string}};
}
export async function saveScouting(fieldId:string,entry:{client_key:string;observed_on:string;crop?:string;symptoms?:string;notes?:string;image:string;observation_category?:ObservationCategory;growth_stage?:GrowthStage;severity?:ObservationSeverity}) {
  const response=await fetch(`/api/fields/${fieldId}/scouting`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});
  const payload=await response.json().catch(()=>({})) as ScoutingCase&{error?:string;diagnosis?:Record<string,unknown>};
  if(!response.ok)throw new Error(payload.error??'Scouting note could not be saved. Keep the form open and retry.');
  return payload;
}
export async function setScoutingResearchConsent(fieldId:string,caseId:string,consented:boolean) {
  const response=await fetch(`/api/fields/${fieldId}/scouting/${caseId}/research-consent`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({consented})});
  const payload=await response.json().catch(()=>({})) as {error?:string;consented?:boolean};
  if(!response.ok||payload.consented!==consented)throw new Error(payload.error??'Research consent could not be updated');
  return payload.consented;
}
export type ResearchReviewCase={case_id:string;observed_on:string;latitude:number;longitude:number};
export type ExpertReviewInput={observed_on:string;observation_category:ObservationCategory;growth_stage:GrowthStage;severity:ObservationSeverity;attest_ground_visit:true};
function isResearchReviewCase(value:unknown):value is ResearchReviewCase{
  if(!value||typeof value!=='object')return false;
  const item=value as Record<string,unknown>;
  return typeof item.case_id==='string'&&typeof item.observed_on==='string'&&typeof item.latitude==='number'&&Number.isFinite(item.latitude)&&typeof item.longitude==='number'&&Number.isFinite(item.longitude);
}
export async function loadResearchReviewQueue() {
  const response=await fetch('/api/research/review-queue');
  const payload=await response.json().catch(()=>({})) as {cases?:unknown;error?:string};
  if(!response.ok)throw new Error(payload.error??'Research review queue is unavailable');
  if(!Array.isArray(payload.cases)||!payload.cases.every(isResearchReviewCase))throw new Error('Research review queue returned invalid records');
  return payload.cases as ResearchReviewCase[];
}
export async function submitExpertInspectionReview(caseId:string,entry:ExpertReviewInput) {
  const response=await fetch(`/api/research/cases/${caseId}/reviews`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});
  const payload=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(payload.error??'Field visit review could not be saved');
}
export async function loadFieldTasks(fieldId:string) {
  const response=await fetch(`/api/fields/${fieldId}/tasks`);
  if(!response.ok)throw new Error('Unable to load follow-up tasks');
  const payload=await response.json() as unknown;
  if(!Array.isArray(payload)||payload.some(task=>!task||typeof task!=='object'||typeof task.id!=='string'||typeof task.title!=='string'))throw new Error('Follow-up task service returned an invalid response');
  return payload as FieldTask[];
}
export async function createFieldTask(fieldId: string, entry: {client_key:string;title:string;reason:string;due_on:string;scene_id:string|null}) {
  const response = await fetch(`/api/fields/${fieldId}/tasks`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(entry) });
  const payload = await response.json().catch(()=>({})) as FieldTask & {error?:string};
  if (!response.ok || !payload.id) throw new Error(payload.error || 'Unable to save the field visit');
  return payload;
}

function isJob(value: unknown): value is ProcessingJob {
  if (!value || typeof value !== 'object') return false;
  const job = value as ProcessingJob;
  return typeof job.id === 'string' && Number.isInteger(job.boundary_version)
    && ['satellite','weather'].includes(job.kind) && ['queued','running','succeeded','failed'].includes(job.status);
}
export async function loadFieldJobs(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/jobs`);
  const payload: unknown = await response.json();
  if (!response.ok || !Array.isArray(payload) || !payload.every(isJob)) throw new Error('Unable to check image progress');
  return payload as ProcessingJob[];
}
export async function queueFieldJob(fieldId: string, kind: 'satellite'|'weather' = 'satellite') {
  const response = await fetch(`/api/fields/${fieldId}/jobs`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind}) });
  const payload: unknown = await response.json();
  if (!response.ok || !isJob(payload)) throw new Error('Image check could not be started. Your field is saved.');
  return payload;
}
export async function updateFieldTask(fieldId:string,taskId:string,status:'open'|'acknowledged'|'action_taken'|'resolved') {
  const response=await fetch(`/api/fields/${fieldId}/tasks/${taskId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
  const payload=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(payload.error??'Unable to update follow-up task');
}

export type Alert = {
  id: string
  title: string
  severity: string
  observed_at: string
  resolved: boolean
  action_status: 'open'|'acknowledged'|'action_taken'|'resolved'|'superseded'
  scene_id: string | null
  stress_geojson: Record<string, unknown> | null
}

export async function loadFieldAlerts(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/alerts`)
  if (!response.ok) throw new Error('Unable to load field alerts')
  return response.json() as Promise<Alert[]>
}

export async function updateFieldAlert(fieldId:string,alertId:string,status:'open'|'acknowledged'|'action_taken'|'resolved') {
  const response=await fetch(`/api/fields/${fieldId}/alerts/${alertId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
  const payload=await response.json().catch(()=>({})) as {error?:string};
  if(!response.ok)throw new Error(payload.error??'Unable to update alert status');
}

export async function resolveFieldAlert(fieldId: string, alertId: string) {
  const response = await fetch(`/api/fields/${fieldId}/alerts/${alertId}/resolve`, { method: 'PATCH' })
  if (!response.ok) throw new Error('Unable to resolve alert')
}

export async function loadFieldOverlay(fieldId: string, sceneId: string) {
  const response = await fetch(`/api/fields/${fieldId}/overlay/${encodeURIComponent(sceneId)}`)
  if (!response.ok) throw new Error('Unable to load overlay')
  return response.json() as Promise<{ image: string; bounds: { north: number; south: number; east: number; west: number } }>
}

export type WeatherObservation = {
  id: string
  observed_on: string
  precipitation_mm: number
  temperature_c: number
  humidity_percent: number
  source_url: string
}

export async function loadWeather(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/weather`)
  if (!response.ok) throw new Error('Unable to load weather')
  return response.json() as Promise<WeatherObservation[]>
}

export interface ProcessingResult { accepted:boolean; sceneId?:string; ndvi?:number; validCoverage?:number; message?:string; attempts:Array<{sceneId:string;status:string;reason?:string}> }
export async function processLatest(fieldId:string):Promise<ProcessingResult> {
  const response=await fetch(`/api/fields/${fieldId}/ndvi/process-latest`,{method:'POST'});
  const payload=await response.json().catch(() => null) as (Partial<ProcessingResult> & {error?:string}) | null;
  if(!response.ok) throw new Error(payload?.error||'Image processing unavailable');
  if (!payload || typeof payload.accepted !== 'boolean' || !Array.isArray(payload.attempts)
    || payload.attempts.some(attempt => !attempt || typeof attempt.sceneId !== 'string' || typeof attempt.status !== 'string')
    || (payload.accepted && typeof payload.sceneId !== 'string')) {
    throw new Error('Image processing returned an incomplete result. Please retry.');
  }
  return payload as ProcessingResult;
}
export interface SatelliteScene {
  scene_id:string; observed_at:string; cloud_cover:number|string|null;
  processing_status?:SceneStatus; processing_error?:string|null;
  valid_coverage_percent?:number|string|null; valid_pixel_count?:number|null;
}


export type ForecastDay={date:string;min_c:number|null;max_c:number|null;rain_probability_percent:number|null;precipitation_mm:number|null;humidity_percent:number|null;wind_speed_kmh:number|null};
export type FieldForecast={source:'Open-Meteo';source_url:string;field_id:string;issued_at:string;timezone:string;units:{temperature:'°C';precipitation:'mm';wind_speed:'km/h'};days:ForecastDay[]};
export async function loadForecast(fieldId:string):Promise<FieldForecast>{
 const response=await fetch(`/api/fields/${encodeURIComponent(fieldId)}/forecast`);
 if(!response.ok){const payload=await response.json().catch(()=>({})) as {error?:string};throw new Error(payload.error||'Forecast temporarily unavailable');}
 const raw=await response.json();
 const payload:FieldForecast=typeof raw.retrievedAt==='string'?{
  source:'Open-Meteo',source_url:raw.sourceUrl,field_id:fieldId,
  issued_at:raw.retrievedAt,timezone:raw.timezone,units:{temperature:'°C',precipitation:'mm',wind_speed:'km/h'},
  days:raw.days.map((day:import('../../../shared/forecast').ForecastDay)=>({date:day.date,min_c:day.minC,max_c:day.maxC,rain_probability_percent:day.rainChance,precipitation_mm:day.rainMm,humidity_percent:day.humidity,wind_speed_kmh:day.windKph}))
 }:raw;
 if(!payload||!Array.isArray(payload.days)||typeof payload.issued_at!=='string')throw new Error('Invalid forecast response');
 return payload;
}

export type MaizePredictionResult = {
  status: 'experimental';
  crop: 'maize';
  prediction: string;
  probability: number;
  predictions: Array<{label:string;probability:number}>;
  model: string;
  disclaimer: string;
};

export async function predictMaizeLeaf(
  fieldId:string,
  image:string
):Promise<MaizePredictionResult> {
  const response = await fetch(
    `/api/fields/${encodeURIComponent(fieldId)}/maize/predict`,
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image})
    }
  );

  const payload = await response.json().catch(
    () => ({})
  ) as Partial<MaizePredictionResult> & {error?:string};

  if (!response.ok) {
    throw new Error(
      payload.error || 'Maize analysis unavailable.'
    );
  }

  if (
    payload.status !== 'experimental' ||
    !Array.isArray(payload.predictions) ||
    typeof payload.prediction !== 'string' ||
    typeof payload.probability !== 'number'
  ) {
    throw new Error('Invalid prediction response.');
  }

  return payload as MaizePredictionResult;
}
