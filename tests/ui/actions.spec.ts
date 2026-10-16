import { test, expect } from '@playwright/test';
import { setup, id, boundary, day } from './fixtures';

test('dashboard retry, empty state, wizard boundary controls and saved-field retry', async ({page}) => {
  const state=await setup(page);state.fields=[];state.fail.add('GET /api/fields');
  await page.goto('/');await expect(page.getByRole('alert')).toContainText('Fields unavailable');
  state.fail.clear();await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.getByRole('button',{name:'Add your first field'}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'+ Add field',exact:true}).click();
  await page.getByLabel('Field Name').fill('New field');await page.getByLabel('Crop Type').fill('Wheat');
  await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
  const map=page.getByLabel('Draw or edit field boundary on OpenStreetMap');
  for(const [i,position] of [{x:70,y:70},{x:170,y:70},{x:170,y:170}].entries()){await map.click({position});await expect(page.locator('.boundary-tools')).toContainText(`${i+1} point`);}
  await page.getByRole('button',{name:'Undo point'}).click();await expect(page.getByRole('button',{name:'Finish boundary'})).toBeDisabled();
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  for(const [i,position] of [{x:70,y:70},{x:170,y:70},{x:170,y:170}].entries()){await map.click({position});await expect(page.locator('.boundary-tools')).toContainText(`${i+1} point`);}
  await page.getByRole('button',{name:'Finish boundary'}).click();await page.getByRole('button',{name:'Review',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Review',exact:true}).click();
  state.fail.add(`POST /api/fields/${id}/jobs`);await page.getByRole('button',{name:'Save & check images'}).click();
  await expect(page.getByRole('status')).toContainText('Your field is saved');await expect(page.getByRole('button',{name:'Open saved field'})).toBeVisible();
  state.fail.clear();await page.getByRole('button',{name:'Retry image check',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/fields/${id}/overview`));expect(state.created).toBe(1);
  await expect(page.getByRole('status')).toContainText('waiting');expect(state.errors).toEqual([]);
});

test('field management, boundary editing, navigation and deletion work on mobile',async({page})=>{
  test.slow(); // Full mobile editing, boundary drawing and deletion can exceed default 30s on CI.
  const state=await setup(page);await page.goto('/');await page.getByRole('link',{name:'Test field',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/overview$'));
  await page.getByRole('button',{name:'Manage field',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Manage field',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Renamed');await page.getByRole('button',{name:'Save changes'}).click();await expect(page.getByRole('heading',{name:'Renamed'})).toBeVisible();
  for(const name of ['Changes over time','Field diary','Field map'])await page.getByRole('link',{name,exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Manage field',exact:true}).click();await page.getByText('Edit field boundary',{exact:true}).click();
  await page.locator('.boundary-map').click({position:{x:200,y:150}});await page.getByRole('button',{name:'Save new boundary version'}).click();await expect(page.getByText('New boundary saved. Check for an image for this outline.')).toBeVisible();
  expect(state.calls).toContain(`PATCH /api/fields/${id}/boundary`);
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Delete field',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete field',exact:true}).click();await expect(page).toHaveURL('/');expect(state.errors).toEqual([]);
});

test('diary errors preserve notes and support event save/delete retries',async({page})=>{
  const state=await setup(page);state.fail.add(`GET /api/fields/${id}/events`);await page.goto(`/fields/${id}/history`);await expect(page.getByRole('alert')).toContainText('Some diary records');
  state.fail.clear();await page.getByRole('button',{name:'Retry loading history'}).click();
  await page.getByLabel('Date',{exact:true}).fill(day(2));await page.getByLabel('Notes (Optional)').fill('Test event');
  state.fail.add(`POST /api/fields/${id}/events`);await page.getByRole('button',{name:'Save Event'}).click();await expect(page.getByRole('alert')).toContainText('Event could not be saved');await expect(page.getByLabel('Notes (Optional)')).toHaveValue('Test event');
  state.fail.clear();await page.getByRole('button',{name:'Save Event'}).click();await expect(page.getByText('Test event',{exact:true})).toBeVisible();
  state.fail.add(`DELETE /api/fields/${id}/events/event-1`);page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.getByText('Test event',{exact:true})).toBeVisible();
  state.fail.clear();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.getByText('No events recorded for this field.')).toBeVisible();expect(state.errors).toEqual([]);
});

test('analysis, language, queued weather and assistant recover from unavailable services',async({page})=>{
  const state=await setup(page);state.fail.add(`GET /api/fields/${id}/ndvi/analysis`);await page.goto(`/fields/${id}/analysis`);await expect(page.getByRole('alert')).toBeVisible();
  state.fail.clear();await page.getByRole('button',{name:'Retry analysis'}).click();await page.getByText('More about the trend',{exact:true}).click();await expect(page.getByText('Two clear images show a vegetation decrease.')).toBeVisible();
  await page.getByLabel('Language / भाषा').selectOption('hi');await expect(page.getByRole('heading',{name:'समय के साथ बदलाव'})).toBeVisible();await expect.poll(()=>state.calls.some(call=>call.includes('language=hi-IN'))).toBeTruthy();await page.getByLabel('Language / भाषा').selectOption('en');
  await page.getByText('Past weather near this field',{exact:true}).click();state.fail.add(`POST /api/fields/${id}/jobs`);await page.getByRole('button',{name:'Update past weather'}).click();await expect(page.getByRole('status')).toContainText('Weather update could not finish');
  state.fail.clear();state.autoComplete=true;await page.getByRole('button',{name:'Update past weather'}).click();await expect.poll(()=>state.jobs.some(job=>job.kind==='weather'&&job.status==='succeeded')).toBeTruthy();
  await expect(page.getByRole('button',{name:'Ask AI'})).toBeDisabled();await page.getByLabel('Question for field assistant').fill('What changed?');state.fail.add('POST /api/assistant');await page.getByRole('button',{name:'Ask AI'}).click();await expect(page.getByRole('alert')).toContainText('Assistant unavailable');
  state.fail.clear();await page.getByRole('button',{name:'Ask AI'}).click();await expect(page.getByText('Review the field before deciding what to do.')).toBeVisible();expect(state.errors).toEqual([]);
});

test('image job status survives reload, keeps selected image and supports alert actions',async({page})=>{
  const state=await setup(page);await page.goto(`/fields/${id}/map`);await expect(page.getByLabel('Image date')).toHaveValue('scene-1');
  await page.getByLabel('Image date').selectOption('scene-2');state.fail.add(`POST /api/fields/${id}/jobs`);await page.getByRole('button',{name:'Check for a new image'}).click();await expect(page.getByRole('alert')).toContainText('Image check could not be started');
  state.fail.clear();await page.getByRole('button',{name:'Check for a new image'}).click();await expect(page.getByRole('status')).toContainText('waiting');await page.reload();await expect(page.getByRole('status')).toContainText('waiting');expect(state.jobs).toHaveLength(1);
  state.jobs[0].status='running';await expect(page.getByRole('status')).toContainText('Checking images for');
  state.jobs[0].status='succeeded';state.jobs[0].result={accepted:true,sceneId:'scene-1'};await expect(page.getByRole('status')).toContainText('usable image was found');
  const notice=page.getByLabel('Notice status');state.fail.add(`PATCH /api/fields/${id}/alerts/00000000-0000-0000-0000-000000000080`);await notice.selectOption('resolved');await expect(page.getByRole('alert')).toBeVisible();
  state.fail.clear();await notice.selectOption('resolved');await expect(page.getByLabel('Notice status')).toHaveCount(0);expect(state.calls.some(call=>call.includes('/ndvi/process-latest'))).toBeFalsy();expect(state.errors).toEqual([]);
});

test('wizard keyboard focus and saved-field exit work after queue failure',async({page})=>{
  const state=await setup(page);await page.goto('/');const add=page.getByRole('button',{name:'+ Add field',exact:true});await add.click();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('button',{name:'Next',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(add).toBeFocused();
  await add.click();await page.getByRole('button',{name:'Close add field'}).click();await add.click();await page.getByLabel('Field Name').fill('Another field');await page.getByLabel('Crop Type').fill('Rice');await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByLabel('Import GeoJSON Polygon').setInputFiles({name:'boundary.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(boundary))});await expect(page.locator('.boundary-tools')).toContainText('4 points');await page.getByRole('button',{name:'Finish boundary'}).click();await page.getByRole('button',{name:'Review',exact:true}).click();
  state.fail.add(`POST /api/fields/${id}/jobs`);await page.getByRole('button',{name:'Save & check images'}).click();await page.getByRole('button',{name:'Open saved field'}).click();await expect(page).toHaveURL(new RegExp('/overview$'));expect(state.created).toBe(1);expect(state.errors).toEqual([]);
});

test('point-only records cannot request image processing without a field boundary',async({page})=>{
  const state=await setup(page);state.fields[0].boundary_geojson=null;state.fields[0].latestObservation=null;await page.goto(`/fields/${id}/map`);await expect(page.locator('.open-field-map')).toBeVisible();await expect(page.getByRole('button',{name:'Check for a new image'})).toBeDisabled();expect(state.errors).toEqual([]);
});

test('help catalog filters and historical public-boundary attribution remain accessible',async({page})=>{
  const state=await setup(page);await page.goto('/');await page.getByRole('link',{name:'How to use',exact:true}).click();await page.getByRole('link',{name:'For more detail: data sources & limitations'}).click();await expect(page.getByRole('heading',{name:'Project datasets'})).toBeVisible();await expect(page.getByRole('status')).toContainText('9 sources');await page.getByLabel('Search datasets').fill('soil');await expect(page.getByRole('heading',{name:'ISRIC SoilGrids'})).toBeVisible();await page.getByLabel('Integration status').selectOption('Connected');await expect(page.getByText('No sources match this search.',{exact:false})).toBeVisible();await page.getByLabel('Search datasets').fill('');await expect(page.getByRole('status')).toContainText('2 sources');
  state.fields[0].isDemo=true;state.fields[0].provenance='public_boundary';state.events=[{id:'source-event',field_id:id,created_at:new Date().toISOString(),event_type:'dataset_import',event_date:day(0),notes:JSON.stringify({dataset:'FTW India',boundary_year:2016,license:'CC BY 4.0',source_url:'https://source.coop/example'})}];
  await page.setViewportSize({width:390,height:844});await page.goto(`/fields/${id}/history`);await expect(page.getByText('Historical boundary recorded in 2016. Current crop and dates are unverified.')).toBeVisible();await expect(page.getByRole('link',{name:'Dataset source and attribution',exact:false})).toHaveAttribute('href','https://source.coop/example');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(state.errors).toEqual([]);
});
