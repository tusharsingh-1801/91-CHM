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
