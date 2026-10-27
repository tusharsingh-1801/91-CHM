import { test, expect } from '@playwright/test';
import { assessEvidence } from '../../shared/evidence';
import { setup, id, seed, latest, previous, day } from './fixtures';

test('missing pictures never produce a reassuring crop summary and lead to the image check', async ({ page }) => {
  const state = await setup(page);
  state.fields = [{ ...seed, latestObservation: null, previousObservation: null, assessment: assessEvidence(null, null) }];
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Let’s get a clearer picture' })).toBeVisible();
  await expect(page.locator('.unknown-message')).toContainText('cannot tell how these crops are doing');
  await expect(page.getByText('No large drop was found', { exact: false })).toHaveCount(0);
  await page.locator('.field-card').getByRole('link', { name: 'Find a clear picture', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/fields/${id}/overview#image-check$`));
  await expect(page.locator('#image-check')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Check for a new image' })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('dashboard has no demo-field toggle', async ({ page }) => {
  const state = await setup(page);
  state.fields = [{ ...seed }];
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Test field' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show sample fields' })).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('due visits get an actionable shortcut even when no large crop change is seen', async ({ page }) => {
  const state = await setup(page);
  const current = { ...latest, ndvi_value: .75 };
  state.fields = [{ ...seed, latestObservation: current, assessment: assessEvidence(current, previous) }];
  state.tasks.push({ id: 'planned-visit', title: 'Visit after irrigation', due_on: day(0), status: 'open' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your planned visits are due' })).toBeVisible();
  await page.locator('.field-card').getByRole('link', { name: 'See planned visits', exact: true }).click();
  await expect(page.locator('#planned-tasks')).toBeFocused();
  await expect(page.locator('#planned-tasks')).toContainText('Visit after irrigation');
  expect(state.errors).toEqual([]);
});

test('the first view uses plain actions and keeps numeric picture details on request', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/');
  const card = page.locator('.field-card');
  await expect(card).toContainText('Next: Plan a field visit');
  await expect(card.getByText('90%', { exact: true })).not.toBeVisible();
  expect(await card.innerText()).not.toMatch(/NDVI|pixels|calculation_version|boundary_version/);
  await card.getByText('Picture date & details', { exact: true }).click();
  await expect(card.getByText('90%', { exact: true })).toBeVisible();
  await card.getByRole('link', { name: 'Open field', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Plan a field visit', exact: true })).toHaveCount(1);
  await expect(page.locator('.condition-details')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Plan a field visit', exact: true }).click();
  await expect(page.getByLabel('Visit title')).toHaveValue('Visit Test field');
  await page.screenshot({ path: test.info().outputPath('simple-field-overview.png'), fullPage: true });
  expect(state.errors).toEqual([]);
});

test('the bilingual help journey explains uncertainty, photos and reports on a phone', async ({ page }) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'How to use', exact: true }).click();
  await expect(page.locator('.help-steps li')).toHaveCount(4);
  await page.getByText('Can a photo identify crop disease?', { exact: true }).click();
  await expect(page.getByText('Automatic disease diagnosis is currently unavailable.', { exact: false })).toBeVisible();
  await page.getByLabel('Language / भाषा').selectOption('hi');
  await expect(page.getByRole('heading', { name: 'कुछ आसान कदमों में अपने खेत का हाल देखें' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: test.info().outputPath('help-hindi-phone.png'), fullPage: true });
  await page.getByRole('link', { name: 'मेरे खेत खोलें', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'आपके खेत। अब क्या करें?' })).toBeVisible();
  expect(state.errors).toEqual([]);
});
