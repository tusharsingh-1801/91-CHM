import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { assessEvidence, type Observation } from '../../shared/evidence';

type Case={key:string;name:string;crop:string;latestNdvi:number|null;previousNdvi:number|null;coverage:number|null;pixels:number|null;latestDaysAgo:number|null;previousDaysAgo:number|null;dueTasks:number;expectedState:string};
const fixture=JSON.parse(readFileSync('tests/fixtures/extended-farmer-scenarios.json','utf8')) as {scenarios:Case[]};
const day=(days:number)=>new Date(Date.now()-days*86400000).toISOString().slice(0,10);
function observation(c:Case,which:'latest'|'previous'):Observation|null {
 const days=which==='latest'?c.latestDaysAgo:c.previousDaysAgo;
 const value=which==='latest'?c.latestNdvi:c.previousNdvi;
 if(days===null||value===null)return null;
 return {scene_id:`SYNTHETIC-${c.key}-${which}`,observed_on:day(Math.max(0,days)),ndvi_value:value,cloud_cover:0,
 valid_coverage_percent:c.coverage,valid_pixel_count:c.pixels,source:'SYNTHETIC DEMO ONLY',
 provenance:'measured_imagery',accepted:true,boundary_version:which==='previous'&&c.key==='boundary-changed'?1:2,
 calculation_version:which==='previous'&&c.key==='method-changed'?'legacy-mock':'demo-mock-v1'};
}
const fields=fixture.scenarios.map((c,i)=>{
 const current=observation(c,'latest'),previous=observation(c,'previous');
 return {id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name:`DEMO • ${c.name}`,
 crop:c.crop,area_hectares:1+(i%5)*.35,health_score:null,ndvi_average:null,health_delta:null,
 canopy_coverage:0,latitude:null,longitude:null,planting_date:null,harvest_date:null,expected_yield_tons:null,
 boundary_version:2,last_observation:current?.observed_on??null,provenance:'demo',isDemo:true,dueTasks:c.dueTasks,
 latestObservation:current,previousObservation:previous,assessment:assessEvidence(current,previous)};
});
test.beforeEach(async({page})=>{
 await page.route('**/api/auth/session',r=>r.fulfill({json:{mode:'local',user:null}}));
 await page.route('**/api/fields',r=>r.fulfill({json:fields}));
});
test('15 fixture scenarios render as supplied records',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Your farm. Your next step.'})).toBeVisible();
 await expect(page.locator('.farmer-field-card')).toHaveCount(15);
 await expect(page.getByText('DEMO • Wheat - inspect').first()).toBeVisible();
 await expect(page.locator('.field-card .demo-label')).toHaveCount(0);
});
test('synthetic crop search narrows sample plot list without touching a database',async({page})=>{
 await page.goto('/');
 await page.getByPlaceholder('Search your fields or crops').fill('Tomato');
 await expect(page.locator('.farmer-field-card')).toHaveCount(1);
 await expect(page.locator('.farmer-field-card').first()).toContainText('incompatible method');
});
