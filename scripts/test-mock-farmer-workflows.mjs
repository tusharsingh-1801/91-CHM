#!/usr/bin/env node
// Read-only integration smoke test of all farmers in .local/mock-farmers-*.json.
// Usage: node scripts/test-mock-farmer-workflows.mjs
// Never creates, changes, or deletes records; no external ingestion jobs.
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('.local');
const supplied=process.argv[2];
const files=(await readdir(root)).filter(x=>/^mock-farmers-[a-f0-9]+\.json$/.test(x)).sort();
if(!supplied&&!files.length)throw new Error('No .local/mock-farmers-*.json found');
const source=supplied?path.resolve(supplied):path.join(root,files.at(-1));
const dataset=JSON.parse(await readFile(source,'utf8'));
const origin=process.env.CHM_API_ORIGIN||'http://localhost:3001';
const web=process.env.CHM_WEB_ORIGIN||'http://localhost:5173';
const engine=process.env.CHM_ENGINE_ORIGIN||'http://127.0.0.1:8000';
const tests=[];
const add=(scope,name,status,details='')=>{tests.push({scope,name,status,details});console.log(status.padEnd(5),scope.padEnd(24),name,details.slice(0,130));};
async function req(url,{cookie='',method='GET',body,timeout=12000}={}){
 try{
  const response=await fetch(url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
  const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{data=raw}
  return {ok:response.ok,status:response.status,data,response};
 }catch(e){return {ok:false,status:0,data:String(e.message||e)}}
}
const check=(scope,name,r,valid)=>add(scope,name,r.ok&&valid(r.data)?'PASS':'FAIL','HTTP '+r.status+(r.ok?'':': '+JSON.stringify(r.data).slice(0,100)));
for(const [name,url] of [['API health',origin+'/api/health'],['Python engine health',engine+'/health'],['Frontend',web+'/']]){
 const r=await req(url);add('Services',name,r.ok?'PASS':'FAIL','HTTP '+r.status);
}
const farmers=dataset.created||[];
for(const farmer of farmers){
 const scope=farmer.name+' ('+farmer.email.split('@')[0].slice(-12)+')';
 const login=await req(origin+'/api/auth/login',{method:'POST',body:{email:farmer.email,password:farmer.password}});
 if(!login.ok){add(scope,'Authentication','FAIL','HTTP '+login.status);continue}
 const cookie=(login.response.headers.get('set-cookie')||'').split(';')[0];
 if(!cookie.startsWith('chm_session=')){add(scope,'Session cookie','FAIL');continue}
 add(scope,'Authentication','PASS');
 const session=await req(origin+'/api/auth/session',{cookie});
 check(scope,'Session identity',session,d=>d?.user?.email===farmer.email);
 const fields=await req(origin+'/api/fields',{cookie});
 check(scope,'Dashboard fields',fields,d=>Array.isArray(d)&&farmer.fields.every(f=>d.some(x=>x.id===f.id)));
 if(!fields.ok)continue;
 for(const field of farmer.fields){
  const id=encodeURIComponent(field.id),label=farmer.name+' '+field.crop+' #'+(farmer.fields.indexOf(field)+1);
  for(const [title,suffix,valid] of [
   ['Diary','events',d=>Array.isArray(d)&&d.length>0],
   ['Scouting/gallery','scouting',d=>Array.isArray(d?.cases)],
   ['Tasks','tasks',d=>Array.isArray(d)||Array.isArray(d?.tasks)],
   ['Alerts','alerts',Array.isArray],
   ['NDVI history','ndvi',Array.isArray],
   ['NDVI analysis','ndvi/analysis?language=en-IN',d=>d&&typeof d==='object'],
   ['Weather','weather',Array.isArray],
   ['Satellite scenes','scenes',Array.isArray],
   ['Jobs','jobs',d=>Array.isArray(d)||Array.isArray(d?.jobs)],
   ['Forecast','forecast',d=>d&&typeof d==='object'],
   ['Reference datasets','datasets',d=>d&&typeof d==='object']
  ]){
   const r=await req(origin+'/api/fields/'+id+'/'+suffix,{cookie});
   if(title==='NDVI history'&&r.ok&&Array.isArray(r.data)&&r.data.length===0){add(label,title,'INFO','No satellite observations yet');continue}
   if(title==='Satellite scenes'&&r.ok&&Array.isArray(r.data)&&r.data.length===0){add(label,title,'INFO','No scenes imported yet');continue}
   if(title==='Weather'&&r.ok&&Array.isArray(r.data)&&r.data.length===0){add(label,title,'INFO','No weather imported yet');continue}
   if(title==='Forecast'&&!r.ok&&[422,503].includes(r.status)){add(label,title,'INFO','Forecast unavailable without evidence/service; HTTP '+r.status);continue}
   check(label,title,r,valid);
  }
  const page=await req(web+'/fields/'+id+'/history',{cookie});
  add(label,'Frontend route',page.ok?'PASS':'FAIL','HTTP '+page.status);
 }
}
const totals=Object.fromEntries(['PASS','FAIL','INFO'].map(s=>[s,tests.filter(t=>t.status===s).length]));
const output=path.join(root,'mock-farmer-test-report-'+dataset.runId+'.json');
await writeFile(output,JSON.stringify({source,generatedAt:new Date().toISOString(),totals,tests},null,2));
console.log('\nTOTALS',JSON.stringify(totals));
console.log('Report:',output);
console.log('NOTE: Read-only API/route checks, not a browser UI test or proof of trained-model inference.');
if(totals.FAIL)process.exitCode=1;
