import {test,expect} from '@playwright/test';
import {forecastFixture,setup,seed,id} from './fixtures';
test('dashboard add-ons use the available field records',async({page})=>{
 await setup(page);
 await page.goto('/');
 await expect(page.locator('.farmer-field-card')).toHaveCount(1);
 const addons=page.getByRole('region',{name:'Farm insights and previews'});
 await expect(addons).toBeVisible();
 for(const heading of ['All fields on one map','Weather · last 7 days','Crop insights','Compare two satellite dates','Recent field activity','Upcoming field visits','Ask Gemini AI','Crop photo gallery']){
  await expect(addons.getByRole('heading',{name:heading})).toBeVisible();
 }
 await expect(addons.locator('.addon-map .leaflet-interactive').first()).toBeVisible();
 await expect(addons.locator('.addon-weather-days>div')).toHaveCount(1);
 await expect(addons.locator('.addon-insight').first()).toContainText('NDVI');
 await expect(addons.locator('.addon-comparison-images .addon-satellite-tile')).toHaveCount(2);
 await expect(addons.locator('.addon-gallery-grid img')).toHaveCount(1);
});

test('dashboard quick question opens existing AI chat and prefills a question',async({page})=>{
 await setup(page);
 await page.goto('/');
 await page.getByRole('button',{name:'Explain NDVI in simple terms'}).click();
 await expect(page.getByRole('region',{name:'Crop assistant chat'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Your question'})).toHaveValue('Explain NDVI in simple terms');
});

test('dashboard forecast reports provider failures, retries, and preserves source attribution',async({page})=>{
 const state=await setup(page);
 state.forecast={...forecastFixture(),source:'Google Weather API',sourceUrl:'https://developers.google.com/maps/documentation/weather'};
 state.fail.add(`GET /api/fields/${id}/forecast`);
 await page.goto('/');
 const forecast=page.locator('.forecast-preview');
 await expect(forecast.getByRole('alert')).toContainText('Service temporarily unavailable');
 state.fail.delete(`GET /api/fields/${id}/forecast`);
 await forecast.getByRole('button',{name:'Retry forecast'}).click();
 await expect(forecast.locator('.forecast-source')).toContainText('Google Weather API');
 await expect(forecast.locator('.forecast-source')).toContainText('Retrieved');
 await expect(forecast.locator('.forecast-source a')).toHaveAttribute('href','https://developers.google.com/maps/documentation/weather');
 expect(state.errors).toEqual([]);
});

test('dashboard image comparison changes when different field is selected',async({page})=>{
 const state=await setup(page);
 state.fields.push({...seed,id:'00000000-0000-4000-0000-000000000002',name:'Rice East'});
 await page.goto('/');
 const area=page.locator('.addon-comparison');
 await expect(area).toContainText('Test field');
 await area.getByRole('combobox',{name:'Field',exact:true}).selectOption({label:'Rice East'});
 await expect(area).toContainText('Rice East');
 await expect(area.locator('.addon-satellite-tile')).toHaveCount(2);
});

test('dashboard map treats saved field names as text, including HTML',async({page})=>{
 const name='<img src=x onerror="window.chmInjected=true">';
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const json=path==='/api/auth/session'?{mode:'local',user:null}:path==='/api/fields'?[{id:'00000000-0000-0000-0000-000000000099',name,crop:'Wheat',area_hectares:1,latitude:28,longitude:77}]:[];
  return route.fulfill({json});
 });
 await page.goto('/');
 const marker=page.locator('.addon-map .leaflet-interactive').first();
 await expect(marker).toBeVisible();
 await marker.dispatchEvent('mouseover');
 const tooltip=page.locator('.addon-map .leaflet-tooltip');
 await expect(tooltip).toHaveText(name);
 await expect(tooltip.locator('img')).toHaveCount(0);
 expect(await page.evaluate(()=>Reflect.get(window,'chmInjected'))).toBeUndefined();
});

test('dashboard does not offer a demo-field switch',async({page})=>{
 await setup(page);
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Show sample fields',exact:true})).toHaveCount(0);
 await expect(page.getByText('Sample fields available',{exact:true})).toHaveCount(0);
});
