import 'dotenv/config'
import express from 'express'
import pg from 'pg'
import proj4 from 'proj4'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, password: process.env.DATABASE_PASSWORD })
const app = express()
const port = Number(process.env.API_PORT ?? 3001)

app.use(express.json())

const initializeDatabase = async () => {
  await pool.query('create extension if not exists "pgcrypto"')
  await pool.query(`
    create table if not exists public.fields (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      crop text not null,
      area_hectares numeric(10,2) not null default 0,
      health_score integer not null default 0 check (health_score between 0 and 100),
      ndvi_average numeric(4,3) not null default 0,
      canopy_coverage integer not null default 0 check (canopy_coverage between 0 and 100),
      health_delta numeric(5,2) not null default 0,
      last_observation date,
      latitude numeric(9,6),
      longitude numeric(9,6),
      boundary_geojson jsonb,
      created_at timestamptz not null default now()
    )
  `)
  await pool.query('alter table public.fields add column if not exists latitude numeric(9,6), add column if not exists longitude numeric(9,6), add column if not exists boundary_geojson jsonb')
  await pool.query(`
    create table if not exists public.alerts (
      id uuid primary key default gen_random_uuid(),
      field_id uuid not null references public.fields(id) on delete cascade,
      title text not null,
      severity text not null check (severity in ('high', 'positive', 'neutral')),
      observed_at timestamptz not null default now(),
      resolved boolean not null default false
    )
  `)
  await pool.query(`
    create table if not exists public.ndvi_observations (
      id uuid primary key default gen_random_uuid(),
      field_id uuid not null references public.fields(id) on delete cascade,
      observed_on date not null,
      ndvi_value numeric(4,3) not null check (ndvi_value between -1 and 1),
      cloud_cover integer not null default 0 check (cloud_cover between 0 and 100),
      source text not null default 'Sentinel-2',
      scene_id text
    )
  `)
  await pool.query('alter table public.ndvi_observations add column if not exists scene_id text')
  await pool.query(`
    create table if not exists public.weather_observations (
      id uuid primary key default gen_random_uuid(),
      field_id uuid not null references public.fields(id) on delete cascade,
      observed_on date not null,
      precipitation_mm numeric(8,2),
      temperature_c numeric(6,2),
      humidity_percent numeric(6,2),
      source text not null default 'NASA POWER',
      source_url text not null,
      unique (field_id, observed_on, source)
    )
  `)
  await pool.query(`
    create table if not exists public.satellite_scenes (
      id uuid primary key default gen_random_uuid(),
      field_id uuid not null references public.fields(id) on delete cascade,
      scene_id text not null,
      collection text not null,
      observed_at timestamptz not null,
      cloud_cover numeric(5,2),
      source text not null,
      catalog_url text not null,
      assets jsonb not null default '{}'::jsonb,
      unique (field_id, scene_id)
    )
  `)
  await pool.query(`
    insert into public.fields (name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation)
    select * from (values
      ('North block', 'Winter wheat', 42.8, 82, 0.740, 78, 4.2, '2026-08-24'::date),
      ('River bend', 'Soybean', 31.4, 68, 0.610, 69, -6.8, '2026-08-24'::date),
      ('East orchard', 'Apple', 18.6, 91, 0.810, 88, 1.4, '2026-08-24'::date)
    ) as seed(name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation)
    where not exists (select 1 from public.fields)
  `)
}

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('select 1')
    response.json({ status: 'ok', database: 'postgresql' })
  } catch {
    response.status(503).json({ status: 'error', database: 'unavailable' })
  }
})

app.post('/api/assistant', async (request, response) => {
  const apiKey = process.env.SARVAM_API_KEY
  if (!apiKey || apiKey.startsWith('your-')) {
    response.status(503).json({ error: 'Sarvam AI is not configured' })
    return
  }
  const { message, fieldId, languageCode } = request.body as { message?: string; fieldId?: string; languageCode?: string }
  if (!message?.trim() || message.trim().length > 2000) {
    response.status(400).json({ error: 'message is required and must be under 2000 characters' })
    return
  }
  try {
    let fieldContext = 'No field was selected.'
    if (fieldId) {
      const fieldResult = await pool.query('select name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation from public.fields where id = $1', [fieldId])
      const field = fieldResult.rows[0]
      if (!field) { response.status(404).json({ error: 'Field not found' }); return }
      const ndviResult = await pool.query('select observed_on, ndvi_value, cloud_cover, source from public.ndvi_observations where field_id = $1 order by observed_on desc limit 5', [fieldId])
      fieldContext = JSON.stringify({ field, recentNdvi: ndviResult.rows })
    }
    const targetLanguage = languageCode?.trim() || 'en-IN'
    const sarvamResponse = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.SARVAM_MODEL ?? 'sarvam-105b',
        messages: [
          { role: 'system', content: `You are TerraScope's crop-health assistant. Answer for a field manager using the supplied field data only. Explain technical terms such as NDVI in plain language, never invent measurements, and clearly say when data is missing. Reply in ${targetLanguage}. Give practical next steps, but do not prescribe pesticides, fertilizer rates, or medical advice.` },
          { role: 'user', content: `Field context: ${fieldContext}\n\nQuestion: ${message.trim()}` },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!sarvamResponse.ok) {
      console.error('Sarvam AI request failed:', sarvamResponse.status)
      response.status(502).json({ error: 'Sarvam AI request failed' })
      return
    }
    const payload = await sarvamResponse.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string }
    const answer = payload.choices?.[0]?.message?.content?.trim()
    if (!answer) { response.status(502).json({ error: 'Sarvam AI returned an empty answer' }); return }
    response.json({ answer, model: payload.model ?? process.env.SARVAM_MODEL ?? 'sarvam-105b', languageCode: targetLanguage })
  } catch (error) {
    console.error('POST /api/assistant failed:', error)
    const messageText = error instanceof DOMException && error.name === 'TimeoutError' ? 'Sarvam AI request timed out' : 'Assistant unavailable'
    response.status(504).json({ error: messageText })
  }
})

app.get('/api/fields', async (_request, response) => {
  try {
    const result = await pool.query('select * from public.fields order by created_at asc')
    response.json(result.rows)
  } catch (error) {
    console.error('GET /api/fields failed:', error)
    response.status(503).json({ error: 'Database unavailable' })
  }
})

app.get('/api/fields/:fieldId/alerts', async (request, response) => {
  try {
    const result = await pool.query('select * from public.alerts where field_id = $1 order by observed_at desc', [request.params.fieldId])
    response.json(result.rows)
  } catch (error) {
    console.error('GET /api/fields/:fieldId/alerts failed:', error)
    response.status(503).json({ error: 'Database unavailable' })
  }
})

app.get('/api/fields/:fieldId/ndvi', async (request, response) => {
  try {
    const result = await pool.query('select * from public.ndvi_observations where field_id = $1 order by observed_on asc', [request.params.fieldId])
    response.json(result.rows)
  } catch (error) {
    console.error('GET /api/fields/:fieldId/ndvi failed:', error)
    response.status(503).json({ error: 'Database unavailable' })
  }
})

app.get('/api/fields/:fieldId/weather', async (request, response) => {
  try {
    const result = await pool.query('select * from public.weather_observations where field_id = $1 order by observed_on asc', [request.params.fieldId])
    response.json(result.rows)
  } catch (error) {
    console.error('GET weather failed:', error)
    response.status(503).json({ error: 'Database unavailable' })
  }
})

app.post('/api/fields/:fieldId/ndvi/from-scene/:sceneId', async (request, response) => {
  try {
    const sceneResult = await pool.query('select * from public.satellite_scenes where field_id = $1 and scene_id = $2', [request.params.fieldId, request.params.sceneId])
    const scene = sceneResult.rows[0]
    if (!scene) { response.status(404).json({ error: 'Satellite scene not found' }); return }
    const assets = scene.assets as Record<string, { href?: string }>
    if (!assets.red?.href || !assets.nir?.href) { response.status(422).json({ error: 'Scene does not contain red and NIR assets' }); return }
    const fieldResult = await pool.query('select boundary_geojson from public.fields where id = $1', [request.params.fieldId])
    const polygon = fieldResult.rows[0]?.boundary_geojson?.coordinates?.[0]
    if (!polygon?.length) { response.status(400).json({ error: 'Field boundary is required for NDVI calculation' }); return }
    const { fromUrl } = await import('geotiff')
    const rasterOptions = { signal: AbortSignal.timeout(120000) }
    const [redTiff, nirTiff] = await Promise.all([fromUrl(assets.red.href, rasterOptions), fromUrl(assets.nir.href, rasterOptions)])
    const [redImage, nirImage] = await Promise.all([redTiff.getImage(), nirTiff.getImage()])
    const bbox = redImage.getBoundingBox()
    const width = redImage.getWidth()
    const height = redImage.getHeight()
    const projectedPolygon = polygon.map((point: number[]) => proj4('EPSG:4326', 'EPSG:32643', [point[0], point[1]]))
    const eastings = projectedPolygon.map((point) => point[0])
    const northings = projectedPolygon.map((point) => point[1])
    const minX = Math.max(0, Math.floor(((Math.min(...eastings) - bbox[0]) / (bbox[2] - bbox[0])) * width))
    const maxX = Math.min(width, Math.ceil(((Math.max(...eastings) - bbox[0]) / (bbox[2] - bbox[0])) * width))
    const minY = Math.max(0, Math.floor(((bbox[3] - Math.max(...northings)) / (bbox[3] - bbox[1])) * height))
    const maxY = Math.min(height, Math.ceil(((bbox[3] - Math.min(...northings)) / (bbox[3] - bbox[1])) * height))
    const window = [minX, minY, maxX, maxY] as [number, number, number, number]
    const [redRaster, nirRaster] = await Promise.all([redImage.readRasters({ window, interleave: true }), nirImage.readRasters({ window, interleave: true })])
    let total = 0
    let valid = 0
    for (let index = 0; index < redRaster.length; index += 1) {
      const red = Number(redRaster[index])
      const nir = Number(nirRaster[index])
      const denominator = nir + red
      if (denominator > 0 && red >= 0 && nir >= 0) { total += (nir - red) / denominator; valid += 1 }
    }
    if (!valid) { response.status(422).json({ error: 'No valid pixels found in field boundary' }); return }
    const ndvi = Number((total / valid).toFixed(4))
    await pool.query('insert into public.ndvi_observations (field_id, observed_on, ndvi_value, cloud_cover, source, scene_id) values ($1, $2::date, $3, $4, $5, $6)', [request.params.fieldId, scene.observed_at, ndvi, scene.cloud_cover, 'Copernicus Sentinel-2 Red/NIR', scene.scene_id])
    response.json({ sceneId: scene.scene_id, observedAt: scene.observed_at, ndvi, validPixels: valid, source: 'Copernicus Sentinel-2' })
  } catch (error) {
    console.error('POST NDVI calculation failed:', error)
    const message = error instanceof DOMException && error.name === 'TimeoutError' ? 'Sentinel raster request timed out' : 'NDVI calculation failed'
    response.status(message.includes('timed out') ? 504 : 503).json({ error: message })
  }
})

app.post('/api/fields/:fieldId/ndvi/process', async (request, response) => {
  const clientId = process.env.SENTINEL_HUB_CLIENT_ID
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET
  if (!clientId || !clientSecret || clientId.startsWith('your-')) { response.status(503).json({ error: 'Sentinel Hub credentials are not configured' }); return }
  try {
    const fieldResult = await pool.query('select boundary_geojson from public.fields where id = $1', [request.params.fieldId])
    const geometry = fieldResult.rows[0]?.boundary_geojson
    if (!geometry) { response.status(400).json({ error: 'Field boundary is required' }); return }
    const tokenResponse = await fetch('https://services.sentinel-hub.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }) })
    if (!tokenResponse.ok) { response.status(502).json({ error: 'Sentinel Hub authentication failed' }); return }
    const token = await tokenResponse.json() as { access_token: string }
    const processResponse = await fetch('https://services.sentinel-hub.com/api/v1/process', { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: { bounds: { geometry }, data: [{ type: 'sentinel-2-l2a', dataFilter: { maxCloudCoverage: 30 }, processing: { upsampling: 'BILINEAR' } }] }, output: { width: 256, height: 256, responses: [{ identifier: 'default', format: { type: 'image/tiff' } }] }, evalscript: '//VERSION=3\nfunction setup(){return {input:["B04","B08"],output:{bands:1,sampleType:"FLOAT32"}}}\nfunction evaluatePixel(sample){return [(sample.B08-sample.B04)/(sample.B08+sample.B04)]}' }) })
    if (!processResponse.ok) { response.status(502).json({ error: 'Sentinel Hub processing failed' }); return }
    const { fromArrayBuffer } = await import('geotiff')
    const image = await (await fromArrayBuffer(await processResponse.arrayBuffer())).getImage()
    const raster = await image.readRasters({ interleave: true })
    const values = Array.from(raster as ArrayLike<number>).filter((value) => Number.isFinite(value) && value >= -1 && value <= 1)
    if (!values.length) { response.status(422).json({ error: 'No valid NDVI pixels returned' }); return }
    const ndvi = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
    await pool.query('insert into public.ndvi_observations (field_id, observed_on, ndvi_value, source) values ($1, current_date, $2, $3)', [request.params.fieldId, ndvi, 'Sentinel Hub Process API / Sentinel-2'])
    response.json({ ndvi, validPixels: values.length, source: 'Sentinel-2 via Sentinel Hub Process API' })
  } catch (error) {
    console.error('POST Sentinel Hub NDVI failed:', error)
    response.status(503).json({ error: 'Sentinel Hub NDVI request failed' })
  }
})

app.get('/api/fields/:fieldId/scenes', async (request, response) => {
  try {
    const result = await pool.query('select * from public.satellite_scenes where field_id = $1 order by observed_at desc', [request.params.fieldId])
    response.json(result.rows)
  } catch (error) {
    console.error('GET satellite scenes failed:', error)
    response.status(503).json({ error: 'Database unavailable' })
  }
})

app.post('/api/fields/:fieldId/ingest/sentinel-scenes', async (request, response) => {
  try {
    const fieldResult = await pool.query('select latitude, longitude, boundary_geojson from public.fields where id = $1', [request.params.fieldId])
    const field = fieldResult.rows[0]
    if (!field?.latitude || !field.longitude) { response.status(400).json({ error: 'Field coordinates are required' }); return }
    const point = field.boundary_geojson?.coordinates?.[0] ?? [[field.longitude, field.latitude]]
    const flatCoordinates = point.flat()
    const minLongitude = Math.min(...flatCoordinates.filter((_value: number, index: number) => index % 2 === 0))
    const maxLongitude = Math.max(...flatCoordinates.filter((_value: number, index: number) => index % 2 === 0))
    const minLatitude = Math.min(...flatCoordinates.filter((_value: number, index: number) => index % 2 === 1))
    const maxLatitude = Math.max(...flatCoordinates.filter((_value: number, index: number) => index % 2 === 1))
    const catalogUrl = 'https://earth-search.aws.element84.com/v1/search'
    const catalogResponse = await fetch(catalogUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collections: ['sentinel-2-l2a'], bbox: [minLongitude, minLatitude, maxLongitude, maxLatitude], datetime: '2026-06-01T00:00:00Z/2026-08-28T23:59:59Z', query: { 'eo:cloud_cover': { lt: 30 } }, limit: 10 }) })
    if (!catalogResponse.ok) { response.status(502).json({ error: 'Sentinel catalog request failed' }); return }
    const catalog = await catalogResponse.json() as { features?: Array<{ id: string; collection?: string[]; properties: { datetime: string; 'eo:cloud_cover'?: number }; assets: Record<string, { href: string; type?: string }> }> }
    let imported = 0
    for (const scene of catalog.features ?? []) {
      await pool.query('insert into public.satellite_scenes (field_id, scene_id, collection, observed_at, cloud_cover, source, catalog_url, assets) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (field_id, scene_id) do update set cloud_cover = excluded.cloud_cover, assets = excluded.assets', [request.params.fieldId, scene.id, scene.collection?.[0] ?? 'sentinel-2-l2a', scene.properties.datetime, scene.properties['eo:cloud_cover'] ?? null, 'Copernicus Sentinel-2 via Earth Search', catalogUrl, JSON.stringify(scene.assets)])
      imported += 1
    }
    response.json({ source: 'Copernicus Sentinel-2', catalogUrl, imported })
  } catch (error) {
    console.error('POST Sentinel scene ingestion failed:', error)
    response.status(503).json({ error: 'Sentinel scene ingestion failed' })
  }
})

app.post('/api/fields/:fieldId/ingest/weather', async (request, response) => {
  const { start, end } = request.body as { start?: string; end?: string }
  try {
    const fieldResult = await pool.query('select latitude, longitude from public.fields where id = $1', [request.params.fieldId])
    const field = fieldResult.rows[0]
    if (!field?.latitude || !field.longitude) { response.status(400).json({ error: 'Field latitude and longitude are required' }); return }
    const from = start ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10).replaceAll('-', '')
    const to = end ?? new Date().toISOString().slice(0, 10).replaceAll('-', '')
    const sourceUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M,RH2M&community=AG&longitude=${field.longitude}&latitude=${field.latitude}&start=${from}&end=${to}&format=JSON`
    const sourceResponse = await fetch(sourceUrl)
    if (!sourceResponse.ok) { response.status(502).json({ error: 'NASA POWER request failed' }); return }
    const payload = await sourceResponse.json() as { properties: { parameter: Record<string, Record<string, number>> } }
    const parameters = payload.properties.parameter
    for (const date of Object.keys(parameters.T2M ?? {})) {
      await pool.query(`insert into public.weather_observations (field_id, observed_on, precipitation_mm, temperature_c, humidity_percent, source_url) values ($1, to_date($2, 'YYYYMMDD'), $3, $4, $5, $6) on conflict (field_id, observed_on, source) do update set precipitation_mm = excluded.precipitation_mm, temperature_c = excluded.temperature_c, humidity_percent = excluded.humidity_percent, source_url = excluded.source_url`, [request.params.fieldId, date, parameters.PRECTOTCORR?.[date], parameters.T2M?.[date], parameters.RH2M?.[date], sourceUrl])
    }
    response.json({ source: 'NASA POWER', sourceUrl, imported: Object.keys(parameters.T2M ?? {}).length })
  } catch (error) {
    console.error('POST weather ingestion failed:', error)
    response.status(503).json({ error: 'Weather ingestion failed' })
  }
})

app.post('/api/fields', async (request, response) => {
  const { name, crop, latitude, longitude } = request.body as { name?: string; crop?: string; latitude?: number; longitude?: number }
  if (!name?.trim() || !crop?.trim()) {
    response.status(400).json({ error: 'name and crop are required' })
    return
  }
  try {
    const result = await pool.query(
      'insert into public.fields (name, crop, latitude, longitude) values ($1, $2, $3, $4) returning *',
      [name.trim(), crop.trim(), latitude ?? null, longitude ?? null],
    )
    response.status(201).json(result.rows[0])
  } catch (error) {
    console.error('POST /api/fields failed:', error)
    response.status(503).json({ error: 'Database unavailable' })
  }
})

app.patch('/api/fields/:fieldId/location', async (request, response) => {
  const { latitude, longitude } = request.body as { latitude?: number; longitude?: number }
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90 || typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
    response.status(400).json({ error: 'Valid latitude and longitude are required' })
    return
  }
  try {
    const result = await pool.query('update public.fields set latitude = $1, longitude = $2 where id = $3 returning *', [latitude, longitude, request.params.fieldId])
    if (!result.rowCount) { response.status(404).json({ error: 'Field not found' }); return }
    response.json(result.rows[0])
  } catch (error) {
    console.error('PATCH field location failed:', error)
    response.status(503).json({ error: 'Database unavailable' })
  }
})

initializeDatabase()
  .then(() => app.listen(port, () => console.log(`PostgreSQL API listening on http://localhost:${port}`)))
  .catch((error) => {
    console.error('PostgreSQL startup failed. Check DATABASE_URL and ensure PostgreSQL is running.', error)
    process.exitCode = 1
  })
