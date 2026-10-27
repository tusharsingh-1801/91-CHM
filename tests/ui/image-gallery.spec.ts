import {test,expect} from '@playwright/test';
import {setup} from './fixtures';
test('photo references show in the dashboard and image gallery',async({page})=>{
 await setup(page);
 await page.goto('/');
 await expect(page.locator('.field-crop-photo img')).toHaveCount(1);
 await page.getByRole('link',{name:'Crop & satellite photos'}).click();
 await expect(page).toHaveURL(/\/gallery/);
 await expect(page.locator('.crop-gallery-card')).toHaveCount(7);
 await expect(page.getByRole('heading',{name:'Satellite NDVI mosaic'})).toBeVisible();
 await expect(page.locator('.crop-gallery-card a[href^="https://"]')).toHaveCount(14);
});
test('field overview provides crop image source reference',async({page})=>{
 await setup(page);
 await page.goto('/');
 await page.getByRole('heading',{name:'Test field',exact:true}).getByRole('link').click();
 await expect(page.locator('.field-overview-photo img')).toHaveCount(1);
 await expect(page.locator('.field-overview-photo a')).toHaveAttribute('href',/unsplash\.com/);
});
