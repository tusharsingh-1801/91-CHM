import {test,expect} from '@playwright/test';
test('forecast and notification components extend dashboard and field without removing original content',async({page})=>{
 await page.goto('/?demo=1');
 await expect(page.getByRole('heading',{name:'Your farm. Your next step.'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Visit reminders'})).toBeVisible();
 await expect(page.locator('.farmer-field-card').first()).toBeVisible();
 await page.goto('/fields/00000000-0000-4000-8000-000000000001/overview?demo=1');
 await expect(page.getByRole('heading',{name:'Next 7 days: weather forecast'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Field summary'})).toBeVisible();
});
test('real layer comparison is additive and never replaces field map',async({page})=>{
 await page.goto('/?demo=1');
 await page.getByRole('link',{name:'Wheat North'}).first().click();
 await page.getByRole('link',{name:'Field map',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Before and after: actual NDVI map layers'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Selected image summary'})).toBeVisible();
});
