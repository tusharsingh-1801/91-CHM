#!/usr/bin/env node
// Non-destructive: build one populated Tushar demo account using the existing Tushar seed account.
// Usage: node scripts/prepare-tushar-demo.mjs
// Does not access or modify other farmers' private fields.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const base=process.env.CHM_API_ORIGIN||'http://localhost:3001';
const creds=JSON.parse(await readFile(path.resolve('.local/tushar-test-account-7586e28d.json'),'utf8'));
async function call(route,{cookie='',method='GET',body,timeout=30000}={}){
 const res=await fetch(base+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
 const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data={raw:raw.slice(0,300)}}
 if(!res.ok)throw new Error(method+' '+route+' '+res.status+' '+JSON.stringify(data));
 return {data,res};
}
const login=await call('/api/auth/login',{method:'POST',body:creds});
const cookie=(login.res.headers.get('set-cookie')||'').split(';')[0];
if(!cookie.startsWith('chm_session='))throw new Error('Session cookie missing');
const fields=(await call('/api/fields',{cookie})).data;
if(!Array.isArray(fields))throw new Error('Unexpected fields response');
const specs=[
 ['Wheat','Tushar Wheat Demonstration',81.2395,26.2295],
 ['Rice','Tushar Rice Demonstration',81.246,26.233],
 ['Mustard','Tushar Mustard Demonstration',81.253,26.237],
 ['Maize','Tushar Maize Demonstration',81.26,26.241],
 ['Potato','Tushar Potato Demonstration',81.267,26.245],
 ['Chickpea','Tushar Chickpea Demonstration',81.274,26.249],
 ['Sugarcane','Tushar Sugarcane Demonstration',81.281,26.253]
];
const out={farmer:'Tushar',email:creds.email,fields:[],notes:'Illustrative fields and reference photo; not verified farm locations or crop-health observations.'};
let photo=null;try{const bytes=await readFile('.local/test-photos/tushar-wheat-demo.jpg');if(bytes[0]===255&&bytes[1]===216)photo='data:image/jpeg;base64,'+bytes.toString('base64')}catch{}
for(const [crop,name,lng,lat] of specs){
 try{
  let field=fields.find(f=>f.name===name);
  if(!field){
   const d=.0006;
   field=(await call('/api/fields',{cookie,method:'POST',body:{name,crop,planting_date:null,harvest_date:null,boundary_geojson:{type:'Polygon',coordinates:[[[lng,lat],[lng+d,lat],[lng+d,lat+d],[lng,lat+d],[lng,lat]]]}}})).data;
   console.log('CREATED',crop,field.id);
  }else console.log('EXISTS',crop,field.id);
  const id=encodeURIComponent(field.id);
  const events=(await call('/api/fields/'+id+'/events',{cookie})).data;
  if(Array.isArray(events)&&!events.some(e=>String(e.notes||'').includes('TERRASCOPE_DEMO_NOTE_V1'))){
   await call('/api/fields/'+id+'/events',{cookie,method:'POST',body:{event_type:'scouting',event_date:new Date().toISOString().slice(0,10),client_key:randomUUID(),notes:'TERRASCOPE_DEMO_NOTE_V1: Synthetic demonstration field. No physical scouting was performed.'}});
  }
  if(photo&&crop==='Wheat'){
   const scouting=(await call('/api/fields/'+id+'/scouting',{cookie})).data;
   if(!Array.isArray(scouting.cases)||!scouting.cases.some(c=>String(c.notes||'').includes('TERRASCOPE_DEMO_REFERENCE_V1'))){
    await call('/api/fields/'+id+'/scouting',{cookie,method:'POST',body:{client_key:randomUUID(),observed_on:new Date().toISOString().slice(0,10),crop,notes:'TERRASCOPE_DEMO_REFERENCE_V1: Wikimedia reference image, not this field. No crop-health diagnosis.',symptoms:'',image:photo,observation_category:'unknown',growth_stage:'unknown',severity:'not_applicable'}});
   }
  }
  const weather=(await call('/api/fields/'+id+'/weather',{cookie})).data;
  if(Array.isArray(weather)&&weather.length===0&&process.env.CHM_INGEST_WEATHER==='1'){
   try{const r=await call('/api/fields/'+id+'/ingest/weather',{cookie,method:'POST',timeout:40000});console.log('WEATHER',crop,r.data.imported)}catch(e){console.warn('WEATHER UNAVAILABLE',crop,e.message)}
  }
  out.fields.push({id:field.id,name,crop,url:'http://localhost:5173/fields/'+field.id+'/overview'});
 }catch(e){console.error('FAILED',crop,e.message);process.exitCode=1}
}
await mkdir('.local',{recursive:true});
await writeFile('.local/tushar-demo-fields.json',JSON.stringify(out,null,2));
console.log('TUSHAR DEMO FIELDS:',out.fields.length,'/7');
console.log('Login email:',creds.email);
console.log('Password remains in .local/tushar-test-account-7586e28d.json');
console.log('Open http://localhost:5173 after signing in as this Tushar account.');
console.log('No other farmer account or existing field was modified. NDVI/weather are not fabricated.');
