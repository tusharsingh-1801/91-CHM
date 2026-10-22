#!/usr/bin/env node
// Populate separate authenticated farmer accounts with synthetic test fields.
// Run: node scripts/seed-mock-farmers.mjs
// Optional: CHM_MOCK_COUNT=8 node scripts/seed-mock-farmers.mjs
// No deletion or mutation of existing records.
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.CHM_API_ORIGIN||'http://localhost:3001';
const count=Number(process.env.CHM_MOCK_COUNT||8);
if(!Number.isInteger(count)||count<1||count>30)throw new Error('CHM_MOCK_COUNT must be 1..30');
const runId=randomUUID().slice(0,8);
const names=['Tushar','Ramesh','Sunita','Rajesh','Geeta','Suresh','Pooja','Mahendra','Anita','Vikram','Meena','Arun','Kavita','Deepak','Neha','Ravi'];
const crops=['Wheat','Rice','Mustard','Maize','Potato','Chickpea','Sugarcane','Wheat'];
const root=path.resolve('.local');
const credentialsPath=path.join(root,'mock-farmers-'+runId+'.json');
const result={runId,created:[],errors:[]};
const today=new Date().toISOString().slice(0,10);
async function call(route,{cookie='',method='GET',body}={}){
 const response=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(method+' '+route+' HTTP '+response.status+' '+JSON.stringify(payload));
 return {payload,response};
}
await mkdir(root,{recursive:true});
const session=(await call('/api/auth/session')).payload;
if(session.mode!=='required')throw new Error('This seed expects AUTH_MODE=required so each farmer has a separate account. No changes made.');
let photo=null;
try {const bytes=await readFile(path.resolve('.local/test-photos/tushar-wheat-demo.jpg'));if(bytes[0]===255&&bytes[1]===216&&bytes.length<5*1024*1024)photo='data:image/jpeg;base64,'+bytes.toString('base64');}catch{}
for(let i=0;i<count;i++){
 const name=names[i%names.length],crop=crops[i%crops.length];
 const email='terrascope.mock.'+runId+'.'+i+'@example.invalid';
 const password=randomBytes(24).toString('base64url');
 const entry={name,email,password,fields:[]};
 try{
  const auth=await call('/api/auth/register',{method:'POST',body:{name,email,password}});
  const cookie=(auth.response.headers.get('set-cookie')||'').split(';')[0];
  if(!cookie.startsWith('chm_session='))throw new Error('No session cookie returned');
  // Small illustrative polygons around distinct points; NOT verified farmland.
  for(let j=0;j<2;j++){
   const lng=80.95+(i%6)*0.035+j*0.009;
   const lat=26.1+Math.floor(i/6)*0.04+j*0.009;
   const d=0.00055;
   const boundary_geojson={type:'Polygon',coordinates:[[[lng,lat],[lng+d,lat],[lng+d,lat+d],[lng,lat+d],[lng,lat]]]};
   const fieldName=name+' '+crop+' Field '+(j+1)+' '+runId;
   const created=(await call('/api/fields',{cookie,method:'POST',body:{name:fieldName,crop,planting_date:null,harvest_date:null,boundary_geojson}})).payload;
   if(!created.id)throw new Error('Missing field ID');
   entry.fields.push({id:created.id,name:fieldName,crop});
   const event=(await call('/api/fields/'+created.id+'/events',{cookie,method:'POST',body:{event_type:'scouting',event_date:today,notes:'Synthetic farmer test record; no actual field visit occurred.',client_key:randomUUID()}})).payload;
   const listed=(await call('/api/fields',{cookie})).payload;
   const fields=Array.isArray(listed)?listed:listed.fields||[];
   if(!fields.some(f=>f.id===created.id))throw new Error('Field persistence failed');
   if(photo&&j===0){
    const saved=(await call('/api/fields/'+created.id+'/scouting',{cookie,method:'POST',body:{
     client_key:randomUUID(),observed_on:today,crop,symptoms:'',
     notes:'Internet reference wheat image; functional upload test only. Not a photograph of this field or necessarily this crop.',
     image:photo,observation_category:'unknown',growth_stage:'unknown',severity:'not_applicable'
    }})).payload;
    const scouting=(await call('/api/fields/'+created.id+'/scouting',{cookie})).payload;
    if(!Array.isArray(scouting.cases)||!scouting.cases.length)throw new Error('Scouting persistence failed');
    entry.fields.at(-1).photoUploaded=true;
   }
   console.log('PASS',name,fieldName,created.id);
  }
  result.created.push(entry);
 }catch(error){result.errors.push({email,error:error.message});console.error('FAIL',email,error.message);if(entry.fields.length)result.created.push(entry)}
 // Save progress even if the next request fails. Contains private test credentials.
 await writeFile(credentialsPath,JSON.stringify(result,null,2),{mode:0o600});
}
console.log('\nCreated',result.created.length,'farmer accounts,',result.created.reduce((n,f)=>n+f.fields.length,0),'fields.');
console.log('Failures:',result.errors.length);
console.log('Private credentials and IDs:',credentialsPath);
console.log('Records preserved; no deletes. Synthetic boundaries and observations are not measured crop-health evidence.');
if(result.errors.length)process.exitCode=1;
