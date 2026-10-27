import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
const base=`http://127.0.0.1:${process.env.API_PORT || 3001}/api`;
const days=Number(process.env.SYNC_WEATHER_DAYS || 30);
if(!Number.isInteger(days)||days<1||days>365)throw new Error('SYNC_WEATHER_DAYS must be 1–365');
const endDate=new Date(Date.now()-3*86400000);
const startDate=new Date(endDate.getTime()-(days-1)*86400000);
const compact=date=>date.toISOString().slice(0,10).replaceAll('-','');
const report={startedAt:new Date().toISOString(),weatherRange:{start:compact(startDate),end:compact(endDate)},fields:[]};
const persist=()=>{mkdirSync('.local',{recursive:true});writeFileSync('.local/data-sync-report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});};
async function request(path,method='GET',body,timeout=135000){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
 const payload=await response.json();if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);return payload;
}
const sceneLimit=Number(process.env.SYNC_SCENE_LIMIT || 6);
if(!Number.isInteger(sceneLimit)||sceneLimit<1||sceneLimit>6)throw new Error('SYNC_SCENE_LIMIT must be 1–6');
const fields=(await request('/fields')).filter(field => field.provenance !== 'demo' && field.provenance !== 'public_boundary');
for(const field of fields){
 const result={id:field.id,name:field.name,weather:null,satellite:null,processed:[],errors:[]};report.fields.push(result);persist();
 console.log(`Syncing ${field.name}…`);
 if(field.latitude==null||field.longitude==null){result.errors.push('GPS location missing; supply actual coordinates or a boundary.');console.log('  Skipped: location missing.');persist();continue;}
 for(const [name,path,body] of [['weather',`/fields/${field.id}/ingest/weather`,report.weatherRange],['satellite',`/fields/${field.id}/ingest/earth-engine-scenes?days=90`,undefined]]){
  try{const data=await request(path,'POST',body);result[name]={imported:data.imported,source:data.source};console.log(`  ${name}: ${data.imported} records synced.`);}
  catch(error){result.errors.push(`${name}: ${error.message}`);console.log(`  ${name}: ${error.message}`);}
  persist();
 }
 if(!field.boundary_geojson){result.errors.push('Field boundary missing; scene metadata can be synced but field-level indices cannot be calculated.');console.log('  NDVI skipped: actual field boundary needed.');persist();continue;}
 if(result.satellite){
  const scenes=await request(`/fields/${field.id}/scenes`);
  const dates=new Set();
  const candidates=[...scenes].sort((a,b)=>b.observed_at.localeCompare(a.observed_at)).filter(scene=>{const day=scene.observed_at.slice(0,10);if(dates.has(day))return false;dates.add(day);return true;}).slice(0,sceneLimit);
  for(const scene of candidates){
   try{const data=await request(`/fields/${field.id}/ndvi/from-scene/${encodeURIComponent(scene.scene_id)}`,'POST');result.processed.push({sceneId:scene.scene_id,observedAt:data.observedAt,ndvi:data.ndvi,coverage:data.validCoverage,accepted:data.accepted,qualityReason:data.qualityReason});console.log(`  ${scene.scene_id}: NDVI ${data.ndvi}, coverage ${data.validCoverage}%`);}
   catch(error){result.errors.push(`${scene.scene_id}: ${error.message}`);console.log(`  Scene skipped: ${error.message}`);}
   persist();
  }
 }
}
report.completedAt=new Date().toISOString();persist();
console.log('Sync finished. Details: .local/data-sync-report.json');
