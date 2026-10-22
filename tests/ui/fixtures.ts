import type { Page } from '@playwright/test';
import { assessEvidence, type Observation } from '../../shared/evidence';
import type { DatabaseField, FieldEvent, FieldTask, ProcessingJob, SatelliteScene, ScoutingCase } from '../../frontend/src/lib/api';
export const id = '00000000-0000-0000-0000-000000000001';
export const day = (ago:number) => new Date(Date.now()-ago*86400000).toISOString().slice(0,10);
export const boundary = {type:'Polygon',coordinates:[[[77,28],[77.01,28],[77.01,28.01],[77,28.01],[77,28]]]};
export const latest: Observation = {scene_id:'scene-1',observed_on:day(2),ndvi_value:.5,ndmi_value:.3,ndre_value:.4,valid_coverage_percent:90,valid_pixel_count:900,cloud_cover:10,source:'Copernicus Sentinel-2',provenance:'measured_imagery',accepted:true,boundary_version:1,calculation_version:'v2'};
export const previous:Observation = {...latest,scene_id:'scene-2',observed_on:day(10),ndvi_value:.75};
export const seed:DatabaseField = {id,name:'Test field',crop:'Wheat',area_hectares:10,health_score:null,health_delta:null,canopy_coverage:0,ndvi_average:.5,latitude:28,longitude:77,planting_date:null,harvest_date:null,expected_yield_tons:null,boundary_geojson:boundary,boundary_version:1,latestObservation:latest,previousObservation:previous,last_observation:latest.observed_on,assessment:assessEvidence(latest,previous),provenance:'user_reported'};
export async function setup(page:Page) {
  const state = {fields:[{...seed}],events:[] as FieldEvent[],scouting:[] as ScoutingCase[],tasks:[] as (FieldTask & {client_key?:string})[],jobs:[] as ProcessingJob[],scenes:[{scene_id:'scene-1',observed_at:latest.observed_on,cloud_cover:10,processing_status:'processed'},{scene_id:'scene-2',observed_at:previous.observed_on,cloud_cover:8,processing_status:'processed'}] as SatelliteScene[],observations:[previous,latest],alerts:[{id:'00000000-0000-0000-0000-000000000080',title:'Inspect vegetation change',scene_id:'scene-1',resolved:false,severity:'neutral',action_status:'open'}],fail:new Set<string>(),calls:[] as string[],created:0,autoComplete:false,errors:[] as string[]};
  const readNotices=new Set<string>();let noticePreferences={visits:true,imagery:true,processing:true,weather:true,browser:false};
  page.on('pageerror',error=>state.errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4ecdc"/></svg>'}));
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
    const action=`${method} ${path}`; state.calls.push(action+url.search);
    if(path==='/api/auth/session')return route.fulfill({json:{mode:'local',user:null}});
    if(state.fail.has(action))return route.fulfill({status:503,json:{error:'Service temporarily unavailable'}});
    if(path==='/api/notifications')return route.fulfill({json:{mode:'account',preferences:noticePreferences,notifications:state.fields.filter(field=>field.assessment?.state==='needs_inspection').map(field=>({id:field.id,field_id:field.id,field_name:field.name,title_en:'A field visit is recommended',title_hi:'खेत की जाँच करें',href:`/fields/${field.id}/map`,kind:'imagery',read_at:readNotices.has(field.id)?new Date().toISOString():null}))}});
    if(path==='/api/notifications/read'){for(const id of req.postDataJSON().ids||[])readNotices.add(id);return route.fulfill({json:{ok:true}});}
    if(path==='/api/notifications/preferences'){noticePreferences=req.postDataJSON();return route.fulfill({json:{preferences:noticePreferences}});}
    if(path.endsWith('.png'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>'});
    let json:unknown=[];
    if(path==='/api/fields'){
      if(method==='POST'){state.created++;const field={...seed,...req.postDataJSON(),latestObservation:null,previousObservation:null,assessment:assessEvidence(null,null)};state.fields.push(field);json=field;}
      else json=state.fields.map(field=>({...field,latestJob:state.jobs.find(job=>job.field_id===field.id&&job.kind==='satellite')??null,dueTasks:state.tasks.filter(task=>task.status!=='resolved'&&task.due_on&&task.due_on<=day(0)).length}));
    } else if(path.endsWith('/events')) {
      if(method==='POST'){const event={id:'event-1',field_id:id,created_at:new Date().toISOString(),...req.postDataJSON()};state.events.push(event);json=event;}else json=state.events;
    } else if(path.includes('/events/')){state.events=[];return route.fulfill({status:204});}
    else if(path.endsWith('/jobs')){
      if(method==='POST'){
        const kind=req.postDataJSON().kind;
        let job=state.jobs.find(item=>item.kind===kind&&['queued','running'].includes(item.status));
        if(!job){job={id:crypto.randomUUID(),field_id:id,boundary_version:1,kind,status:'queued',progress:'Queued',result:null,error:null,created_at:new Date().toISOString(),finished_at:null};state.jobs.unshift(job);}
        json=job;
      }else {if(state.autoComplete)state.jobs.forEach(job=>{job.status='succeeded';job.result=job.kind==='weather'?{imported:7}:{accepted:true,sceneId:'scene-1',validCoverage:90};});json=state.jobs;}
    } else if(path.endsWith('/tasks')){
      if(method==='POST'){const body=req.postDataJSON();let task=state.tasks.find(item=>item.client_key===body.client_key);if(!task){task={id:crypto.randomUUID(),...body,status:'open'};state.tasks.push(task!);}json=task;}else json=state.tasks;
    } else if(path.includes('/tasks/')){const task=state.tasks.find(item=>item.id===path.split('/').at(-1));if(task)task.status=req.postDataJSON().status;json=task;}
    else if(path.endsWith('/datasets'))json={items:[],hasMore:false,offset:0,limit:1};
    else if(path.endsWith('/scouting'))json={cases:state.scouting,diagnosis:{status:'unavailable',provider:null,reason:'No provider'}};
    else if(path.endsWith('/alerts'))json=state.alerts;
    else if(path.includes('/alerts/')){Object.assign(state.alerts[0],{action_status:req.postDataJSON().status,resolved:req.postDataJSON().status==='resolved'});json=state.alerts[0];}
    else if(path.endsWith('/boundary')){state.fields[0].boundary_geojson=req.postDataJSON().boundary_geojson;state.fields[0].boundary_version=2;json=state.fields[0];}
    else if(path.endsWith('/scenes'))json=state.scenes;
    else if(path.endsWith('/ndvi/analysis'))json={status:'analysed',statusLabel:'Decreasing vegetation',summary:'Two clear images show a vegetation decrease.',observations:2,slopePerDay:-.025};
    else if(path.endsWith('/ndvi'))json=state.observations;
    else if(path.endsWith('/weather'))json=[{observed_on:day(3),temperature_c:28,precipitation_mm:0}];
    else if(path==='/api/assistant')json={answer:'Review the field before deciding what to do.',evidenceDates:[day(2)]};
    else if(path===`/api/fields/${id}`){if(method==='DELETE'){state.fields=[];return route.fulfill({status:204});}Object.assign(state.fields[0],req.postDataJSON());json=state.fields[0];}
    return route.fulfill({json});
  });
  return state;
}
