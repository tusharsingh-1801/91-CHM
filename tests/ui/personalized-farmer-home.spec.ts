import { test, expect } from '@playwright/test';
import { setup } from './fixtures';

test('farmer landing is additive and provides primary decision and AI actions', async ({page}) => {
  const state = await setup(page);
  await page.goto('/');
  await expect(page.getByRole('region', {name:'Personalized farm home'})).toBeVisible();
  const home = page.getByRole('region', {name:'Personalized farm home'});
  await expect(home.getByRole('heading', {name:/Hello,/})).toBeVisible();
  await expect(home.getByRole('heading', {name:'What would you like to see?'})).toBeVisible();
  await expect(home.getByRole('heading', {name:'Need advice? Ask Gemini AI'})).toBeVisible();
  await expect(home.getByRole('heading', {name:'Follow up on your fields'})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Your farm. Your next step.'})).toBeVisible();
  await home.getByRole('button', {name:'Explain NDVI'}).click();
  await expect(page.getByRole('region', {name:'Crop assistant chat'})).toBeVisible();
  await expect(page.getByRole('textbox', {name:'Your question'})).toHaveValue('Explain NDVI changes and what they do not prove.');
  expect(state.errors).toEqual([]);
});
