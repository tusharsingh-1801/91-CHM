import {test,expect} from '@playwright/test';
import {setup} from './fixtures';
import {readFileSync} from 'node:fs';

test('demo query parameters do not inject sample fields or dataset cards',async({page})=>{
 await setup(page);
 await page.goto('/?demo=1');
 await expect(page.getByRole('heading',{name:'Hello, Farmer!'})).toBeVisible();
 await expect(page.locator('.fh-field')).toHaveCount(1);
 await expect(page.locator('.fh-field',{hasText:'Test field'})).toBeVisible();
 await page.goto('/datasets');
 await expect(page).toHaveURL(/\/(\?|$)/);
 await expect(page.getByRole('heading',{name:'Soil Moisture Grid'})).toHaveCount(0);
});
