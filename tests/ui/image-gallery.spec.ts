import {test,expect} from '@playwright/test';
test('photo references show in standalone demo dashboard and image gallery',async({page})=>{
 await page.goto('/?demo=1');
 await expect(page.locator('.field-crop-photo img')).toHaveCount(8);
 await page.getByRole('link',{name:'Crop & satellite photos'}).click();
 await expect(page).toHaveURL(/\/gallery/);
 await expect(page.locator('.crop-gallery-card')).toHaveCount(5);
 await expect(page.getByRole('heading',{name:'Satellite NDVI mosaic'})).toBeVisible();
 await expect(page.locator('.crop-gallery-card a[href^="https://"]')).toHaveCount(10);
});
test('field overview provides crop image source reference',async({page})=>{
 await page.goto('/?demo=1');
 await page.getByRole('link',{name:'Wheat North'}).first().click();
 await expect(page.locator('.field-overview-photo img')).toHaveCount(1);
 await expect(page.locator('.field-overview-photo a')).toHaveAttribute('href',/unsplash\.com/);
});
