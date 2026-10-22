import {test,expect} from '@playwright/test';
import {setup,id} from './fixtures';

for(const [name,payload] of [
 ['missing items',[]],
 ['null row',{items:[null]}],
 ['missing payload',{items:[{provider:'worldcover'}]}],
] as const){
 test(`invalid reference response (${name}) does not crash the field workspace`,async({page})=>{
  const state=await setup(page);
  await page.route('**/api/fields/*/datasets?*',route=>route.fulfill({json:payload}));
  await page.goto(`/fields/${id}/overview`);
  await expect(page.getByRole('alert').filter({hasText:'Reference data unavailable. Other field readings remain available.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Manage field',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Field diary',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/fields/${id}/history`));
  expect(state.errors).toEqual([]);
 });
}

test('empty references show unconfigured sources while valid reference results render',async({page})=>{
 const state=await setup(page);
 await page.goto(`/fields/${id}/overview`);
 const references=page.locator('section').filter({has:page.getByRole('heading',{name:'Land, rainfall and soil references',exact:true})});
 await expect(references.getByRole('article')).toHaveCount(6);
 await expect(references).toContainText('worldcover — Not configured');
 await page.route('**/api/fields/*/datasets?*',route=>route.fulfill({json:{items:new URL(route.request().url()).searchParams.get('provider')==='worldcover'?[{id:'reference-1',provider:'worldcover',status:'integrated',source:'ESA WorldCover',version:'2021',source_url:'https://esa-worldcover.org',license:'CC BY 4.0',period:'2021',fetched_at:'2026-10-22T00:00:00Z',coverage_percent:90,error:null,payload:{cropland_percent:75}}]:[]}}));
 await page.reload();
 await expect(references).toContainText('ESA WorldCover — Available');
 await expect(references).toContainText('75.0%');
 expect(state.errors).toEqual([]);
});

test('demo references use the same paginated response without a live backend',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/fields/00000000-0000-4000-8000-000000000001/overview?demo=1');
 await expect(page.getByText('worldcover — Not configured',{exact:true})).toBeVisible();
 await expect(page.getByText('Reference data unavailable. Other field readings remain available.',{exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('CropHarvest shows verified labels and feature counts without claiming a model',async({page})=>{
 const state=await setup(page);
 await page.route('**/api/fields/*/datasets?*',route=>route.fulfill({json:{items:new URL(route.request().url()).searchParams.get('provider')==='cropharvest'?[{id:'crop-reference',provider:'cropharvest',status:'downloaded',source:'NASA Harvest CropHarvest',version:'10251170',source_url:'https://zenodo.org/records/10251170',license:'CC BY-SA 4.0',period:'research benchmark',fetched_at:'2026-10-23T00:00:00Z',coverage_percent:null,error:null,payload:{label_count:113893,feature_sample_count:20,feature_status:'downloaded_verified',training_status:'not_trained'}}]:[]}}));
 await page.goto(`/fields/${id}/overview`);
 const source=page.getByRole('article').filter({has:page.getByRole('heading',{name:/NASA Harvest CropHarvest/})});
 await expect(source).toContainText('Benchmark labels: 113893');
 await expect(source).toContainText('Verified feature samples: 20');
 await expect(source).toContainText('no trained model implied');
 expect(state.errors).toEqual([]);
});

for(const scenario of ['calendar-demo','model-evaluated','worldcereal-aoi'] as const){
 test(`pending dataset state is explicit: ${scenario}`,async({page})=>{
  const state=await setup(page);
  const provider=scenario==='calendar-demo'?'fao-calendar':scenario==='model-evaluated'?'cropharvest':'worldcereal';
  const payload=scenario==='calendar-demo'?{is_demo:true,official_data_status:'India not available from official source',recommendations:[{region:'India — illustrative only',crop:'Rice',season:'Kharif (demo)',planting_start_month:6,planting_end_month:7,harvest_start_month:10,harvest_end_month:11,source_title:'Demo fixture',source_url:'https://example.invalid/demo',accessed_on:'2026-10-23',license:'CC0',permission_reference:'Synthetic demo'}]}:scenario==='model-evaluated'?{feature_sample_count:87464,training_status:'trained_heldout_evaluated',training_metrics:{accuracy:.8,balanced_accuracy:.7,f1:.75,test_samples:100}}:{availability:'aoi_export_required'};
  await page.route('**/api/fields/*/datasets?*',route=>route.fulfill({json:{items:new URL(route.request().url()).searchParams.get('provider')===provider?[{id:'pending',provider,status:scenario==='worldcereal-aoi'?'not_configured':'manual',source:provider,version:'test',source_url:'https://example.invalid',license:'Test fixture',period:'reference',fetched_at:'2026-10-23T00:00:00Z',payload}]:[]}}));
  await page.goto(`/fields/${id}/overview`);
  if(scenario==='calendar-demo'){await expect(page.getByRole('heading',{name:/DEMO ONLY — not FAO data/})).toBeVisible();await expect(page.getByRole('note')).toContainText('not official FAO records');}
  else if(scenario==='model-evaluated'){await expect(page.getByText(/Research model evaluated on held-out sources/)).toBeVisible();await expect(page.getByText(/Accuracy 80.0%/)).toContainText('F1 0.750');}
  else await expect(page.getByRole('note')).toContainText('matching official AOI raster is required');
  expect(state.errors).toEqual([]);
 });
}
