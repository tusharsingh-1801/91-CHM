#!/usr/bin/env node
// Run locally: node scripts/seed-tushar-farmer.mjs
// Non-destructive: creates one uniquely named field and one photo observation.
// Never treats a web photo as a real on-farm diagnosis.
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const origin = process.env.CHМ_API_ORIGIN || process.env.CHM_API_ORIGIN || 'http://localhost:3001';
const photoPath = path.resolve(process.env.CHM_TEST_PHOTO || '.local/test-photos/tushar-wheat-demo.jpg');
const runId = randomUUID().slice(0, 8);
const name = 'Tushar Wheat Field ' + runId;
const boundary = { type:'Polygon', coordinates:[[
  [81.23950,26.22950],[81.24015,26.22950],[81.24015,26.23010],[81.23950,26.23010],[81.23950,26.22950]
]] }; // illustrative polygon, not a verified farm boundary
async function request(url, options={}) {
  const response = await fetch(origin+url, options);
  const raw = await response.text();
  let data; try {data=JSON.parse(raw)} catch {data={raw:raw.slice(0,500)}}
  if(!response.ok) throw new Error(`${options.method||'GET'} ${url}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
try {
  const file=await readFile(photoPath);
  const info=await stat(photoPath);
  assert(info.size>0 && info.size<=5*1024*1024,'Photo must be between 1 byte and 5 MB');
  assert(file[0]===0xff && file[1]===0xd8,'Expected a JPEG file');
  console.log('Photo verified:',photoPath,info.size,'bytes');
  const health=await request('/api/health');
  console.log('API health: OK');
  const field=await request('/api/fields',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({
    name,crop:'Wheat',planting_date:null,harvest_date:null,boundary_geojson:boundary
  })});
  assert(typeof field.id==='string','Field response missing ID');
  console.log('Field created:',field.id,name);
  const fields=await request('/api/fields');
  const fieldList=Array.isArray(fields)?fields:Array.isArray(fields.fields)?fields.fields:[];
  assert(fieldList.some(f=>f.id===field.id),'Created field not found in GET /api/fields');
  console.log('Field persistence: PASS');
  const observationDate=new Date().toISOString().slice(0,10);
  const photo=await request(`/api/fields/${encodeURIComponent(field.id)}/scouting`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      client_key:randomUUID(),observed_on:observationDate,crop:'Wheat',
      symptoms:'',notes:'External Wikimedia reference image for functional upload testing only. Not photographed on this field; no crop-health diagnosis.',
      image:'data:image/jpeg;base64,'+file.toString('base64'),
      observation_category:'unknown',growth_stage:'unknown',severity:'not_applicable'
    })
  });
  console.log('Photo POST: PASS',photo.id||'');
  const scouting=await request(`/api/fields/${encodeURIComponent(field.id)}/scouting`);
  const cases=Array.isArray(scouting)?scouting:Array.isArray(scouting.cases)?scouting.cases:[];
  assert(cases.length>0,'Scouting GET returned no cases');
  console.log('Photo persistence: PASS; cases:',cases.length);
  console.log('RESULT: PASS. Open '+origin.replace(':3001',':5173')+'/fields/'+field.id+'/history');
  console.log('Created records were NOT deleted. Boundary and photo are reference test data.');
} catch(error) { console.error('RESULT: FAIL:',error.message);process.exitCode=1 }
