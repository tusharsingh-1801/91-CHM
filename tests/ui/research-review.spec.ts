import {expect,test} from '@playwright/test';

test.use({baseURL:'http://127.0.0.1:5175'});

test('reviewer records independent field-visit labels only after explicit attestation',async({page})=>{
 let submitted:Record<string,unknown>|undefined;
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{mode:'local',user:null}});
  if(path==='/api/research/review-queue')return route.fulfill({json:{cases:[{case_id:'00000000-0000-0000-0000-000000000221',observed_on:'2026-10-20',latitude:28.1,longitude:77.2}]}});
  if(path.endsWith('/reviews')&&request.method()==='POST'){
   submitted=request.postDataJSON() as Record<string,unknown>;
   return route.fulfill({status:201,json:{id:'review-1'}});
  }
  return route.fulfill({json:[]});
 });
 await page.goto('/research/review');
 await expect(page.getByRole('heading',{name:'Research field reviews'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open field location in OpenStreetMap'})).toHaveAttribute('href',/mlat=28\.1.*mlon=77\.2/);
 await expect(page.getByText(/grower’s report and photos are intentionally hidden/)).toBeVisible();
 await page.getByLabel('Field visit date').fill('2026-10-21');
 await page.getByLabel('Observed category').selectOption('general_observation');
 await page.getByLabel('Observed growth stage').selectOption('flowering');
 await page.getByLabel('Observed severity').selectOption('mild');
 const save=page.getByRole('button',{name:'Save field-visit review'});
 await expect(save).toBeDisabled();
 await page.getByLabel('I personally visited this field and these are my independent observations.').check();
 await save.click();
 await expect(page.getByRole('status')).toContainText('saved in the audit history');
 expect(submitted).toMatchObject({observed_on:'2026-10-21',observation_category:'general_observation',growth_stage:'flowering',severity:'mild',attest_ground_visit:true});
});
