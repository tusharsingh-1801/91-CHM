import { test, expect } from '@playwright/test';
import { setup } from './fixtures';

const credit = (page: import('@playwright/test').Page) => page.locator('.data-credits');

test('the help page credits the open data sources with links', async ({ page }) => {
  await setup(page);
  await page.goto('/help');
  await expect(credit(page)).toContainText('Copernicus Sentinel-2');
  await expect(credit(page)).toContainText('NASA POWER');
  await expect(credit(page).getByRole('link', { name: 'Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/');
  await expect(credit(page).getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
});

test('the signed-out landing page carries the same credit line', async ({ page }) => {
  await page.route('**/api/**', route => route.request().url().includes('/api/auth/session')
    ? route.fulfill({ json: { mode: 'required', user: null } })
    : route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(credit(page)).toContainText('Copernicus Sentinel-2');
  await expect(credit(page)).toContainText('Open-Meteo.com');
});
