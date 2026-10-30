import {expect, test} from '@playwright/test';
import {setup} from './fixtures';

const datasetId='pldd-up-potato-leaf-disease';

async function mockDatasetPageApis(page:import('@playwright/test').Page) {
 await page.route('**/api/datasets/apy/filters**',route=>route.fulfill({json:{
  states:['Uttar Pradesh'],districts:[],crops:[],years:[],sources:[],
 }}));
 await page.route('**/api/datasets/apy?**',route=>route.fulfill({json:{
  items:[],hasMore:false,offset:0,limit:100,
 }}));
}

test('PLDD-UP dataset is attributed and clearly separated from satellite monitoring',async({page})=>{
 const state=await setup(page);
 await mockDatasetPageApis(page);
 await page.route('**/api/research/potato-leaf',route=>route.fulfill({
  json:{dataset_id:datasetId,model_available:false},
 }));
 await page.goto('/datasets');

 const dataset=page.getByRole('article').filter({has:page.getByRole('heading',{name:/PLDD-UP:/})});
 await dataset.getByText(/Source details/).click();
 await expect(dataset).toContainText('10.17632/3j4nfkvp2n.1');
 await expect(dataset).toContainText('Healthy: 4,600 images');
 await expect(dataset).toContainText('Early Blight: 4,803 images');
 await expect(dataset).toContainText('Late Blight: 6,116 images');
 await expect(dataset).toContainText('not live satellite crop-health observations');
 await expect(page.getByRole('heading',{name:'Experimental potato leaf image analysis'})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'no potato model has been trained'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Analyze potato leaf'})).toHaveCount(0);
 expect(state.errors).toEqual([]);
});

test('potato image upload displays experimental probabilities only when a model is available',async({page})=>{
 const state=await setup(page);
 await mockDatasetPageApis(page);
 await page.route('**/api/research/potato-leaf',route=>route.fulfill({
  json:{dataset_id:datasetId,model_available:true},
 }));
 await page.route('**/api/research/potato-leaf/predict',route=>route.fulfill({json:{
  status:'experimental',
  crop:'potato',
  dataset_id:datasetId,
  prediction:'Early Blight',
  probability:0.72,
  predictions:[
   {label:'Early Blight',probability:0.72},
   {label:'Healthy',probability:0.2},
   {label:'Late Blight',probability:0.08},
  ],
  model:'pldd-up-mobilenet-v2-experimental-1',
  dataset_provenance:'Mendeley Data, DOI 10.17632/3j4nfkvp2n.1, CC BY 4.0',
  limitations:[
   'Field-collected leaf photos, not satellite observations.',
   'Not a validated commercial diagnostic and not representative of all districts or varieties.',
   'Model probabilities are not diagnostic confidence.',
  ],
  disclaimer:'Experimental only, not a confirmed diagnosis.',
 }}));
 await page.goto('/datasets');
 await page.getByLabel('Choose potato leaf photo').setInputFiles({
  name:'leaf.png',
  mimeType:'image/png',
  buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64'),
 });
 await page.getByRole('button',{name:'Analyze potato leaf'}).click();
 await expect(page.getByRole('heading',{name:'Experimental result: Early Blight'})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'Experimental result'})).toContainText('72.00%');
 await expect(page.getByText(/not a confirmed diagnosis/i)).toBeVisible();
 await expect(page.getByText(/not representative of all districts or varieties/i)).toBeVisible();
 expect(state.errors).toEqual([]);
});
