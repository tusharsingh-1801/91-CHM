import {test,expect} from '@playwright/test';
test('offline fallback explains limits without showing private field data',async({page})=>{
 await page.goto('/offline.html');
 await expect(page.getByRole('heading',{name:'TerraScope is offline'})).toBeVisible();
 await expect(page.getByText('Internet access is needed', {exact:false})).toBeVisible();
 await expect(page.locator('p[lang="hi"]')).toBeVisible();
 await expect(page.getByRole('button',{name:'Try again / फिर कोशिश करें'})).toBeVisible();
});
