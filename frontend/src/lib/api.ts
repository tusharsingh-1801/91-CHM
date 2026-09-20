export type DatabaseField = {
  id: string
  name: string
  crop: string
  area_hectares: number
  health_score: number
  ndvi_average: number
  canopy_coverage: number
  health_delta: number
  last_observation: string | null
  latitude: number | null
  longitude: number | null
  planting_date: string | null
  harvest_date: string | null
  expected_yield_tons: number | null
  boundary_geojson?: Record<string, unknown> | null
  stress_geojson?: Record<string, unknown> | null
}

export async function loadFields() {
  const response = await fetch('/api/fields')
  if (!response.ok) throw new Error('Unable to load fields')
  return response.json() as Promise<DatabaseField[]>
}

export async function createField(name: string, crop: string) {
  const response = await fetch('/api/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, crop }) })
  if (!response.ok) throw new Error('Unable to create field')
  return response.json() as Promise<DatabaseField>
}

export async function checkApiHealth() {
  const response = await fetch('/api/health')
  if (!response.ok) throw new Error('PostgreSQL API unavailable')
  return response.json() as Promise<{ status: string; database: string }>
}

export async function askFieldAssistant(message: string, fieldId?: string, languageCode = 'en-IN') {
  const response = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, fieldId, languageCode }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error ?? 'Assistant unavailable')
  }
  return response.json() as Promise<{ answer: string; model: string; languageCode: string }>
}

export async function ingestWeather(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ingest/weather`, { method: 'POST' })
  if (!response.ok) throw new Error('Weather ingestion failed')
  return response.json() as Promise<{ source: string; imported: number }>
}

export async function ingestSentinelScenes(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ingest/sentinel-scenes`, { method: 'POST' })
  if (!response.ok) throw new Error('Sentinel scene ingestion failed')
  return response.json() as Promise<{ source: string; imported: number }>
}

export async function loadScenes(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/scenes`)
  if (!response.ok) throw new Error('Unable to load satellite scenes')
  return response.json() as Promise<Array<{ scene_id: string; observed_at: string; cloud_cover: number | string }>>
}

export async function calculateNdvi(fieldId: string, sceneId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ndvi/from-scene/${encodeURIComponent(sceneId)}`, { method: 'POST' })
  if (!response.ok) throw new Error('NDVI calculation failed')
  return response.json() as Promise<{ sceneId: string; ndvi: number; validPixels: number; source: string }>
}

export type VegetationIndexObservation = {
  observed_on: string
  ndvi_value: number | string
  ndre_value: number | string | null
  ndmi_value: number | string | null
  savi_value: number | string | null
  evi_value: number | string | null
  cloud_cover: number | string
  source: string
  scene_id: string | null
}

export async function loadNdvi(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ndvi`)
  if (!response.ok) throw new Error('Unable to load NDVI observations')
  return response.json() as Promise<VegetationIndexObservation[]>
}

export type NdviAnalysis = {
  status: string
  statusLabel: string
  trend?: 'improving' | 'declining' | 'stable'
  stage?: string
  summary: string
  recommendation?: string
  observations: number
  average?: number
  slopePerObservation?: number
  volatility?: number
  predictedNext?: number
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

export async function createFieldEvent(fieldId: string, event_type: string, event_date: string, notes?: string) {
  const response = await fetch(`/api/fields/${fieldId}/events`, { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ event_type, event_date, notes }) 
  })
  if (!response.ok) throw new Error('Unable to create field event')
  return response.json() as Promise<FieldEvent>
}

export type Alert = {
  id: string
  title: string
  severity: string
  observed_at: string
  resolved: boolean
  scene_id: string | null
  stress_geojson: Record<string, unknown> | null
}

export async function loadFieldAlerts(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/alerts`)
  if (!response.ok) throw new Error('Unable to load field alerts')
  return response.json() as Promise<Alert[]>
}
