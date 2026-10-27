import {test,expect} from '@playwright/test';
import {setup,id} from './fixtures';
test('forecast and notification components extend dashboard and field without removing original content',async({page})=>{
 await setup(page);
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Your farm. Your next step.'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Visit reminders'})).toBeVisible();
 await expect(page.locator('.farmer-field-card').first()).toBeVisible();
 await page.goto(`/fields/${id}/overview`);
 await expect(page.getByRole('heading',{name:'Next 7 days · Weather forecast'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Field summary'})).toBeVisible();
});
test('real layer comparison is additive and never replaces field map',async({page})=>{
 await setup(page);
 await page.goto('/');
 await page.getByRole('link',{name:'Test field'}).first().click();
 await page.getByRole('link',{name:'Field map',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Compare processed image layers'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Selected image summary'})).toBeVisible();
});
