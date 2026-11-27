import { expect, test } from '@playwright/test';
import { setup, id, latest } from './fixtures';

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const series = [[48, .18], [38, .31], [28, .47], [18, .55], [8, .41], [3, .29]]
  .map(([ago, value], index) => ({ ...latest, scene_id: `r-${index}`, observed_on: day(ago), ndvi_value: value }));

test('all five field sections are visible on a phone, not hidden in a sideways strip', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await setup(page);
  await page.goto(`/fields/${id}/analysis`);
  const tabs = page.getByRole('navigation', { name: 'Field sections' });
  const links = tabs.getByRole('link');
  await expect(links).toHaveCount(5);
  for (const box of await links.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()))) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(360);
    expect(box.height).toBeGreaterThanOrEqual(40);            // still a comfortable touch target
  }
  expect(await tabs.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(tabs.getByRole('link', { name: 'Changes over time' })).toBeInViewport();
});

test('inspection details stack label over select on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await setup(page);
  await page.goto(`/fields/${id}/history`);
  for (const name of ['Observation category', 'Observed growth stage', 'Reported severity']) {
    const select = page.getByLabel(name);
    await select.scrollIntoViewIfNeeded();
    const box = (await select.boundingBox())!;
    expect(box.width).toBeGreaterThan(360 * 0.7);               // full-width, not squeezed beside its label
  }
  const [a, b] = await Promise.all([page.getByLabel('Observation category').boundingBox(), page.getByLabel('Observed growth stage').boundingBox()]);
  expect(b!.y).toBeGreaterThan(a!.y + a!.height);               // one control per row
});

test('the trend card keeps its text off the border at laptop width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page);
  await page.route(`**/api/fields/${id}/ndvi`, route => route.fulfill({ json: series }));
  await page.goto(`/fields/${id}/analysis`);
  const card = page.locator('.vegetation-trends');
  await expect(card).toBeVisible();
  const gap = await card.evaluate(node => (node.querySelector('h3') as HTMLElement).getBoundingClientRect().left - node.getBoundingClientRect().left);
  expect(gap).toBeGreaterThanOrEqual(12);
});

test('change labels between chart points appear on a laptop but not on a narrow phone, where they collide', async ({ page }) => {
  await setup(page);
  const five = series.slice(1);                                   // 5 pictures: the case that collided on a phone
  await page.route(`**/api/fields/${id}/ndvi`, route => route.fulfill({ json: five }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/fields/${id}/analysis`);
  const chart = page.locator('.vegetation-chart');
  await expect(chart).toContainText('▼');
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(chart).not.toContainText('▼');
  for (const value of ['0.31', '0.47', '0.55', '0.41', '0.29']) await expect(chart.getByText(value, { exact: true }).first()).toBeVisible();   // the values themselves stay
});

test('no sideways scrolling at 320 px on the pages changed here', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setup(page);
  for (const tab of ['analysis', 'history', 'map']) {
    await page.goto(`/fields/${id}/${tab}`);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
});

for (const [width, height, minShare] of [[1536, 864, .95], [1920, 1080, .9]] as const) {
  test(`pages use the screen on a ${width} px laptop instead of a narrow centred column`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    for (const path of [`/fields/${id}/analysis`, `/fields/${id}/map`, '/']) {
      await page.goto(path);
      await page.locator('.field-shell, .dashboard-shell, .farm-home').first().waitFor();
      const content = await page.evaluate(() => {
        const el = (document.querySelector('.field-shell, .dashboard-shell, .farm-home') as HTMLElement);
        const r = el.getBoundingClientRect(); return r.width;
      });
      expect(content, path).toBeGreaterThanOrEqual(width * minShare - 70);   // the old 1120-1440 px caps fail this
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });
}

test('very wide screens stay capped so lines remain readable', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await setup(page);
  await page.goto(`/fields/${id}/analysis`);
  await page.locator('.field-shell').waitFor();
  const width = await page.evaluate(() => (document.querySelector('.field-shell') as HTMLElement).getBoundingClientRect().width);
  expect(width).toBeGreaterThan(1900);
  expect(width).toBeLessThanOrEqual(2040);
});

for (const [width, height] of [[1280, 800], [360, 780]] as const) {
  test(`vegetation legend stays bottom-left and clear of the map controls at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    await page.goto(`/fields/${id}/map`);
    const legend = page.locator('.field-map-canvas .ndvi-map-legend');
    await expect(legend).toBeVisible();
    await page.waitForTimeout(800);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('.field-map-canvas') as HTMLElement;
      const frame = canvas.getBoundingClientRect(), box = (document.querySelector('.field-map-canvas .ndvi-map-legend') as HTMLElement).getBoundingClientRect();
      const overlaps: string[] = [];
      for (const el of Array.from(canvas.querySelectorAll('.leaflet-control, .gmnoprint, .gm-control-active, .gm-bundled-control'))) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) overlaps.push(el.className.toString().slice(0, 40));
      }
      return { fromLeft: box.left - frame.left, rightGap: frame.right - box.right, overlaps };
    });
    expect(result.fromLeft).toBeLessThanOrEqual(24);               // bottom-left
    expect(result.rightGap).toBeGreaterThanOrEqual(width < 600 ? 80 : 12);   // right side stays free for zoom / street view
    expect(result.overlaps).toEqual([]);
  });
}
