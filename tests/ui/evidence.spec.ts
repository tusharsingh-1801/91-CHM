import {test,expect} from '@playwright/test';
import {assessEvidence,type Observation} from '../../shared/evidence';
test.use({baseURL:'http://127.0.0.1:5175'});
const now=Date.now();
const day=(days:number)=>new Date(now-days*86400000).toISOString().slice(0,10);
const measured:Observation={scene_id:'new',observed_on:day(2),ndvi_value:.5,valid_coverage_percent:91,valid_pixel_count:900,cloud_cover:30,source:'Copernicus Sentinel-2 / Earth Search',provenance:'measured_imagery',accepted:true,boundary_version:1,calculation_version:'v2'};
const before:Observation={...measured,scene_id:'before',observed_on:day(12),ndvi_value:.75};
const seed={id:'00000000-0000-0000-0000-000000000071',name:'River field',crop:'Wheat',area_hectares:12,latitude:28,longitude:77,boundary_version:1,last_observation:measured.observed_on,latestObservation:measured,previousObservation:before,assessment:assessEvidence(measured,before,undefined,now),provenance:'user_reported'};
for(const width of [320,390,768,1440]){
 test(`farmer evidence workflow and screenshot at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'}));
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/auth/session')return route.fulfill({json:{mode:'local',user:null}});
   if(path==='/api/fields')return route.fulfill({json:[seed,
    {...seed,id:'00000000-0000-0000-0000-000000000072',name:'Older orchard',last_observation:day(40),latestObservation:{...measured,observed_on:day(40)},assessment:assessEvidence({...measured,observed_on:day(40)},before,undefined,now)},
    {...seed,id:'00000000-0000-0000-0000-000000000073',name:'New field',last_observation:null,latestObservation:null,assessment:assessEvidence(null,null)},
    ]});
   if(path.endsWith('/ndvi'))return route.fulfill({json:[before,measured]});
   if(path.endsWith('/ndvi/analysis'))return route.fulfill({json:{status:'analysed',statusLabel:'Decreasing vegetation',summary:'Vegetation decreased. Inspect the field to understand why.',observations:2,slopePerDay:-.025,dateStart:before.observed_on,dateEnd:measured.observed_on}});
   return route.fulfill({json:[]});
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Visit these fields first'})).toBeVisible();
  const summary=page.getByRole('region',{name:'Farm summary'});
  await expect(summary).toContainText('Fields to visit');await expect(summary).toContainText('Waiting for pictures');await expect(summary.getByRole('button',{name:/Your saved fields/}).locator('strong')).toHaveText('3');
  await page.screenshot({path:test.info().outputPath(`overview-${width}.png`),fullPage:true});
  await page.getByLabel('Search fields').fill('River');await expect(page.locator('.field-card')).toHaveCount(1);
  await page.getByLabel('Search fields').fill('');
  await page.goto(`/fields/${seed.id}/analysis`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('region',{name:'Field evidence'})).toContainText('Visit this field');
  await expect(page.getByRole('region',{name:'Field evidence'})).toContainText('91%');
  await expect(page.getByRole('region',{name:'Vegetation trends'}).locator('.recharts-surface')).toBeVisible();
  const comparison=page.getByRole('region',{name:'Two-date comparison'});
  await page.getByText('Advanced: measurements and experimental score',{exact:true}).click();
  await expect(comparison).toContainText('NDVI change between these dates: -0.250');
  await expect(comparison).toContainText('91%');
  await expect(comparison).toContainText('900 pixels');
  const timeline=page.getByRole('region',{name:'Acquisition timeline'});
  await expect(timeline).toContainText('before');
  await expect(timeline).toContainText('new');
  await page.getByText('Advanced: measurements and experimental score',{exact:true}).click();
  await expect(page.getByRole('region',{name:'Vegetation observations'})).not.toBeVisible();
  await page.getByLabel('Date range').selectOption('30');await page.getByLabel('Show on chart').selectOption('ndmi_value');
  await page.getByLabel('Show on chart').selectOption('ndvi_value');
  await page.screenshot({path:test.info().outputPath(`trends-${width}.png`),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'Manage field',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Manage field',exact:true})).toBeFocused();
  expect(errors).toEqual([]);
 });
}
