import {test,expect} from '@playwright/test';
test('dashboard preserves existing fields and shows all eight additive panels in standalone demo',async({page})=>{
 await page.goto('/?demo=1');
 await expect(page.locator('.farmer-field-card')).toHaveCount(24);
 const addons=page.getByRole('region',{name:'Farm insights and previews'});
 await expect(addons).toBeVisible();
 for(const heading of ['All fields on one map','Weather · last 7 days','Crop insights','Compare two satellite dates','Recent field activity','Upcoming field visits','Ask Gemini AI','Crop photo gallery']){
  await expect(addons.getByRole('heading',{name:heading})).toBeVisible();
 }
 await expect(addons.locator('.addon-map .leaflet-interactive').first()).toBeVisible();
 await expect(addons.locator('.addon-weather-days>div')).toHaveCount(7);
 await expect(addons.locator('.addon-insight').first()).toContainText('NDVI');
 await expect(addons.locator('.addon-comparison-images .addon-satellite-tile')).toHaveCount(2);
 await expect(addons.locator('.addon-gallery-grid img')).toHaveCount(4);
});

test('dashboard quick question opens existing AI chat and prefills a question',async({page})=>{
 await page.goto('/?demo=1');
 await page.getByRole('button',{name:'Explain NDVI in simple terms'}).click();
 await expect(page.getByRole('region',{name:'Crop assistant chat'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Your question'})).toHaveValue('Explain NDVI in simple terms');
});

test('dashboard image comparison changes when different field is selected',async({page})=>{
 await page.goto('/?demo=1');
 const area=page.locator('.addon-comparison');
 await expect(area).toContainText('Wheat North');
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

test('sample fields are discoverable without opening advanced filters',async({page})=>{
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  return route.fulfill({json:path==='/api/auth/session'?{mode:'local',user:null}:path==='/api/fields'?[{id:'00000000-0000-0000-0000-000000000099',name:'Sample wheat',crop:'Wheat',area_hectares:1,isDemo:true,provenance:'demo'}]:[]});
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Sample wheat',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Show sample fields',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sample wheat',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Hide sample fields',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sample wheat',exact:true})).toHaveCount(0);
});
