import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:5175' });
const id = '00000000-0000-0000-0000-000000000099';
const longText = 'NorthFieldWithAnUnusuallyLongUnbrokenName'.repeat(3);
const field = { id, name: longText, crop: 'Wheat', area_hectares: 12, latitude: 28, longitude: 77, last_observation: '2026-10-12', health_score: 80, ndvi_average: .7 };

for (const size of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 768, height: 1024 },
  { width: 1024, height: 768 }, { width: 1440, height: 900 },
]) {
  test(`pages and dialogs fit ${size.width} × ${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' }));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      let json: unknown = [];
      if (path === '/api/auth/session') json = { mode:'local', user:null };
      else if (path === '/api/fields') json = [field];
      else if (path.endsWith('/ndvi/analysis')) json = { statusLabel: 'Healthy', summary: longText, recommendation: 'Monitor moisture.' };
      else if (path.endsWith('/ndvi')) json = [{ observed_on: '2026-10-12', cloud_cover: 1, ndvi_value: .7, ndre_value: .3, ndmi_value: .4 }];
      else if (path.endsWith('/weather')) json = [{ observed_on: '2026-10-12', temperature_c: 28, precipitation_mm: 5 }];
      else if (path.endsWith('/events')) json = [{ id: 'event', event_type: 'scouting', event_date: '2026-10-12', notes: longText }];
      return route.fulfill({ json });
    });
    const fits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'page should not scroll horizontally').toBeTruthy();
    };
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'My fields' })).toBeVisible();
    await fits();
    await page.getByRole('button', { name: 'Add New Field' }).click();
    await page.getByLabel('Field Name').selectOption('__other');await page.getByLabel('Other field name').fill('Phone field');
    await page.getByLabel('Crop Type').selectOption('Rice');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByLabel('Planting Date')).toBeVisible();
    await fits();
    await page.getByRole('button', { name: 'Close add field' }).click();
    for (const tab of ['map', 'analysis', 'history']) {
      await page.goto(`/fields/${id}/${tab}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: longText, exact: true })).toBeVisible();
      if (tab === 'analysis') {
        await expect(page.getByLabel('Question for field assistant')).toBeVisible();
        await page.getByText('Advanced: measurements and experimental score',{exact:true}).click();
        const table = page.getByRole('region', { name: 'Vegetation observations' });
        await expect(table).toBeVisible();
        await page.getByText('Past weather near this field',{exact:true}).click();
        await expect(page.getByText('Temperature (°C)', { exact: true })).toBeVisible();
        if (size.width < 600) expect(await table.evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
      }
      if (tab === 'history') await expect(page.getByLabel('Notes (Optional)')).toBeVisible();
      await fits();
      if (tab === 'analysis') await page.screenshot({ path: test.info().outputPath('analysis.png'), fullPage: true });
    }
    await page.getByRole('button', { name: 'Manage field', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).scrollIntoViewIfNeeded();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    await fits();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
}
