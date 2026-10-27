import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {setup,id,seed,day,latest} from './fixtures';
import {assessEvidence} from '../../shared/evidence';

test('inspection actions stay separate from missing imagery, with working filters',async({page})=>{
  const state=await setup(page);
  state.fields.push({...seed,id:'00000000-0000-0000-0000-000000000002',name:'Cloudy field',latestObservation:null,previousObservation:null,assessment:assessEvidence(null,null)});
  await page.goto('/');const attention=page.locator('.attention-panel');await expect(attention).toContainText('Test field');await expect(attention).toContainText('Cloudy field');
  await page.getByRole('button',{name:/Waiting for pictures/}).click();await expect(page.locator('.field-card')).toHaveCount(1);await expect(page.locator('.field-card')).toContainText('Cloudy field');
  await page.getByLabel('Search fields').fill('No such field');await page.getByRole('button',{name:'Clear filters'}).click();await expect(page.locator('.field-card')).toHaveCount(2);expect(state.errors).toEqual([]);
});

test('Hindi and acre preferences persist across navigation and reload at phone width',async({page})=>{
  const state=await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByLabel('Language / भाषा').selectOption('hi');await page.getByLabel('क्षेत्रफल की इकाई').selectOption('acre');
  await expect(page.getByRole('heading',{name:'आपके खेत। अब क्या करें?'})).toBeVisible();await page.getByRole('link',{name:'Test field',exact:true}).click();await expect(page.getByRole('region',{name:'खेत की स्थिति'})).toContainText('24.71 एकड़');await page.reload();await expect(page.getByLabel('Language / भाषा')).toHaveValue('hi');await expect(page.getByLabel('क्षेत्रफल की इकाई')).toHaveValue('acre');
  await expect(page.getByRole('button',{name:/खेत की जाँच तय करें/})).toBeVisible();await expect(page.getByRole('region',{name:'खेत की स्थिति'})).toContainText('खेत जाकर देखें');
  expect(await page.evaluate(async()=>{const fonts=await document.fonts.load('16px "Noto Sans Devanagari"','खेत');return fonts.length>0;})).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:test.info().outputPath('field-overview-hindi-390.png'),fullPage:true});expect(state.errors).toEqual([]);
});

test('planning a visit pre-fills field evidence and preserves entries on retry without duplicates',async({page})=>{
  const state=await setup(page);await page.goto('/');await page.locator('.attention-panel').getByRole('link',{name:'Plan a field visit'}).click();
  await expect(page.getByLabel('Visit title')).toHaveValue('Visit Test field');await expect(page.getByLabel('Reason for the visit')).toHaveValue(/less green/);await page.getByLabel('Visit date').fill(day(0));
  state.fail.add(`POST /api/fields/${id}/tasks`);await page.getByRole('button',{name:'Save visit'}).click();await expect(page.getByRole('alert')).toContainText('Visit could not be saved');await expect(page.getByLabel('Visit title')).toHaveValue('Visit Test field');
  state.fail.clear();await page.getByRole('button',{name:'Save visit'}).click();await expect(page.getByRole('status').filter({hasText:'Field visit saved'})).toBeVisible();expect(state.tasks).toHaveLength(1);expect(state.tasks[0].scene_id).toBe(latest.scene_id);await page.reload();await expect(page.getByText('Visit Test field',{exact:true})).toBeVisible();await page.getByLabel('Visit status: Visit Test field').selectOption('action_taken');await expect.poll(()=>state.tasks[0].status).toBe('action_taken');expect(state.errors).toEqual([]);
});

test('failed jobs have an obvious retry, and image metadata is hidden until requested',async({page})=>{
  const state=await setup(page);state.jobs.push({id:'failed-job',field_id:id,boundary_version:1,kind:'satellite',status:'failed',progress:'Provider unavailable',result:null,error:'Provider timeout',created_at:new Date().toISOString(),finished_at:new Date().toISOString()});
  await page.goto(`/fields/${id}/map`);await expect(page.getByRole('region',{name:'Selected image evidence'})).not.toBeVisible();await expect(page.getByRole('button',{name:'Retry image check'})).toBeVisible();await page.getByRole('button',{name:'Retry image check'}).click();await expect(page.getByRole('status')).toContainText('waiting');
  await page.getByText('Technical image details',{exact:true}).click();await expect(page.getByRole('region',{name:'Selected image evidence'})).toContainText('Scene ID: scene-1');await page.setViewportSize({width:1440,height:900});await page.screenshot({path:test.info().outputPath('field-map-1440.png'),fullPage:true});expect(state.errors).toEqual([]);
});

test('reports export exactly the chosen date range and retain quality, provenance and boundary identity',async({page})=>{
  const state=await setup(page);state.observations.push({...latest,scene_id:'old-boundary',boundary_version:0,ndvi_value:.99});
  state.scouting.push({id:'inspection-1',observed_on:day(1),crop:'Wheat',symptoms:'Leaf spots',notes:'North row',observation_category:'visual_symptom',growth_stage:'vegetative',severity:'moderate',provenance:'owner_reported',verification_status:'unverified',diagnosis_status:'unavailable',diagnosis:{},photos:[{id:'inspection-photo-1',width:640,height:480,quality:'acceptable'}]});
  await page.goto(`/fields/${id}/report`);await page.getByLabel('From',{exact:true}).fill(day(3));await page.getByLabel('To',{exact:true}).fill(day(0));
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download readings CSV'}).click();const file=await download;const contents=await readFile((await file.path())!, 'utf8');
  expect(contents).toContain('usable_coverage_percent');expect(contents).toContain('measured_imagery');expect(contents).toContain('scene-1');expect(contents).not.toContain('scene-2');expect(contents).not.toContain('old-boundary');
  const inspectionsDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download inspections CSV'}).click();const inspectionsFile=await inspectionsDownload;const inspections=await readFile((await inspectionsFile.path())!,'utf8');
  expect(inspections).toContain('visual_symptom');expect(inspections).toContain('vegetative');expect(inspections).toContain('moderate');expect(inspections).toContain('owner_reported');expect(inspections).toContain('unverified');expect(inspections).toContain('"1","acceptable"');
  await expect(page.getByRole('heading',{name:'Scouting inspections in this period'})).toBeVisible();await expect(page.getByText('Leaf spots')).toBeVisible();await expect(page.getByText('Owner-reported; not expert-verified.')).toBeVisible();
  const geometry=page.waitForEvent('download');await page.getByRole('button',{name:'Download boundary'}).click();const boundaryFile=await geometry;const geo=JSON.parse(await readFile((await boundaryFile.path())!,'utf8'));expect(geo.properties.field_id).toBe(id);expect(geo.properties.boundary_version).toBe(1);
  await page.emulateMedia({media:'print'});await expect(page.locator('.report-toolbar')).not.toBeVisible();await expect(page.getByRole('heading',{name:'Test field',exact:true})).toBeVisible();await page.screenshot({path:test.info().outputPath('field-report-print.png'),fullPage:true});expect(state.errors).toEqual([]);
});

test('photo shortcut opens the photo form, and no crop diagnosis is advertised',async({page})=>{
  const state=await setup(page);await page.goto(`/fields/${id}/overview`);await page.getByRole('link',{name:/Add photo & note/}).click();await expect(page.locator('#scouting-photo')).toBeFocused();await expect(page.getByText(/automatic disease diagnosis is not available/)).toBeVisible();expect(state.errors).toEqual([]);
});
