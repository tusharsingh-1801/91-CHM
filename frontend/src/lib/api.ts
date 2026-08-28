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

export type NdviObservation = { observed_on: string; ndvi_value: number | string; cloud_cover: number | string; source: string; scene_id: string | null }

export async function loadNdvi(fieldId: string) {
  const response = await fetch(`/api/fields/${fieldId}/ndvi`)
  if (!response.ok) throw new Error('Unable to load NDVI observations')
  return response.json() as Promise<NdviObservation[]>
}