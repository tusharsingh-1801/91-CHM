import { expect, test } from '@playwright/test';

const fieldId = '00000000-0000-0000-0000-000000000201';
const boundary = {
  type: 'Polygon',
  coordinates: [[[77, 28], [77.01, 28], [77.01, 28.01], [77, 28.01], [77, 28]]],
};
const currentObservation = {
  scene_id: 'accepted-b',
  observed_on: '2026-10-12',
  ndvi_value: 0.62,
  valid_coverage_percent: 87,
  valid_pixel_count: 870,
  cloud_cover: 18,
  source: 'Copernicus Sentinel-2',
  provenance: 'measured_imagery',
  accepted: true,
  boundary_version: 2,
  calculation_version: 'sentinel-reflectance-scl-v2',
};

test('onboarding leaves a saved field available while its image check runs in the background', async ({page}) => {
  const {setup,id,boundary}=await import('./fixtures');
  const state=await setup(page);state.fields=[];
  await page.goto('/');await page.getByRole('button',{name:'+ Add field',exact:true}).click();
  await page.getByLabel('Field Name').fill('North block');await page.getByLabel('Crop Type').fill('Wheat');
  await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByLabel('Import GeoJSON Polygon').setInputFiles({name:'field.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(boundary))});
  await page.getByRole('button',{name:'Finish boundary'}).click();await page.getByRole('button',{name:'Review',exact:true}).click();
  await page.getByRole('button',{name:'Save & check images'}).click();await expect(page).toHaveURL(new RegExp(`/fields/${id}/overview`));
  await expect(page.getByRole('status').filter({hasText:'Image check is waiting.'})).toBeVisible();expect(state.created).toBe(1);expect(state.fields[0].planting_date).toBeNull();
  state.jobs[0].status='succeeded';state.jobs[0].result={accepted:false,message:'No usable image available'};
  await expect(page.getByRole('status').filter({hasText:'No usable new image'})).toBeVisible();
  await page.getByRole('button',{name:'Check for a new image'}).click();expect(state.created).toBe(1);await expect.poll(()=>state.jobs.length).toBe(2);
});

test('same-date map scenes select exact latest evidence and keep scene/boundary evidence aligned through refresh', async ({ page }) => {
  const field = {
    id: fieldId, name: 'River field', crop: 'Wheat', area_hectares: 3,
    latitude: 28, longitude: 77, boundary_geojson: boundary, boundary_version: 2,
    last_observation: '2026-10-12', latestObservation: currentObservation,
  };
  let sceneReads = 0;
  let queued=false;
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { mode: 'local', user: null } });
    if (path === '/api/fields') return route.fulfill({ json: [field] });
    if (path.endsWith('/scenes')) {
      sceneReads += 1;
      return route.fulfill({ json: [
        { scene_id: 'newer-id', observed_at: '2026-10-12T12:00:00Z', cloud_cover: 2, processing_status: 'rejected' },
        { scene_id: 'accepted-b', observed_at: '2026-10-12T09:00:00Z', cloud_cover: 18, processing_status: 'processed' },
        { scene_id: 'historical-a', observed_at: '2026-10-12T08:00:00Z', cloud_cover: 8, processing_status: 'processed' },
        { scene_id: 'older-boundary', observed_at: '2026-10-12T06:00:00Z', cloud_cover: 5, processing_status: 'processed' },
      ] });
    }
    if (path.endsWith('/ndvi')) return route.fulfill({ json: [
      currentObservation,
      { ...currentObservation, scene_id: 'newer-id', valid_coverage_percent: 21, valid_pixel_count: 210, accepted: false, quality_reason: 'Not enough usable field pixels' },
      { ...currentObservation, scene_id: 'historical-a', valid_coverage_percent: 85, valid_pixel_count: 850 },
      { ...currentObservation, scene_id: 'older-boundary', boundary_version: 1, valid_coverage_percent: 99, valid_pixel_count: 990 },
    ] });
    if (path.endsWith('/jobs')) {
      const job={id:'test-job',field_id:fieldId,boundary_version:2,kind:'satellite',status:route.request().method()==='POST'?'queued':'succeeded',progress:'Complete',result:{accepted:false},error:null};
      if(route.request().method()==='POST'){queued=true;return route.fulfill({json:job});}
      return route.fulfill({json:queued?[job]:[]});
    }
    return route.fulfill({ json: [] });
  });

  await page.goto(`http://127.0.0.1:5175/fields/${fieldId}/map`);
  const observationSelect = page.getByLabel('Image date');
  await expect(observationSelect).toHaveValue('accepted-b');
  await page.getByText('Technical image details',{exact:true}).click();
  const evidence = page.getByRole('region', { name: 'Selected image evidence' });
  await expect(evidence).toContainText('Latest clear picture');
  await expect(evidence).toContainText('Scene ID: accepted-b');
  await expect(evidence).toContainText('87%');
  await expect(evidence).toContainText('Current field boundary version: 2');

  await observationSelect.selectOption('newer-id');
  await expect(evidence).toContainText('Picture too unclear to use');
  await expect(evidence).toContainText('21%');
  await expect(evidence).toContainText('Not accepted: Not enough usable field pixels');

  await observationSelect.selectOption('older-boundary');
  await expect(evidence).toContainText('Picture not checked for this field outline');
  await expect(evidence).toContainText('Usable field coverage: Unavailable');
  await expect(evidence).toContainText('Selected evidence boundary version: Unavailable');

  await observationSelect.selectOption('historical-a');
  await expect(evidence).toContainText('Older clear picture');
  await page.getByRole('button', { name: 'Check for a new image' }).click();
  await expect(page.getByRole('status').filter({hasText:'No usable new image'})).toBeVisible();
  await expect(observationSelect).toHaveValue('historical-a');
  expect(sceneReads).toBeGreaterThanOrEqual(2);
});
