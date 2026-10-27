import {test,expect} from '@playwright/test';
import {setup} from './fixtures';

test('demo query parameters do not inject sample fields or dataset cards',async({page})=>{
 await setup(page);
 await page.goto('/?demo=1');
 await expect(page.getByRole('heading',{name:'Your farm. Your next step.'})).toBeVisible();
 await expect(page.locator('.farmer-field-card')).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'Test field',exact:true})).toBeVisible();
 await page.goto('/datasets');
 await expect(page.getByText('10 sources')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Soil Moisture Grid'})).toHaveCount(0);
});
