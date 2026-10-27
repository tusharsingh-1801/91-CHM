import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {unlink,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pool} from '../db/pool.ts';
import {processScene,processLatest} from './satellite.ts';
import {getFields} from '../controllers/fieldsController.ts';
import {hashToken} from './auth.ts';
import {app} from '../app.ts';
import {runOne} from './jobs.ts';
import type {Request,Response} from 'express';

function integrationDatabaseUrl(value:string|undefined):URL{
 assert.ok(value,'DATABASE_URL must point to the dedicated CHM integration database');
 const url=new URL(value);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Integration tests may only connect to loopback PostgreSQL');
 assert.ok(['5432','5435'].includes(url.port||'5432'),'Integration tests may only use the standard local PostgreSQL ports');
 assert.equal(url.pathname,'/chm_integration','Refusing to run against a development or production database');
 return url;
}

test('integration database guard rejects ordinary development and remote databases',()=>{
 assert.throws(()=>integrationDatabaseUrl('postgres://localhost:5432/terrascope'),/development or production/);
 assert.throws(()=>integrationDatabaseUrl('postgres://db.example.com:5432/chm_integration'),/loopback/);
});

// Explicit opt-in: requires a dedicated local CHM integration database and deletes only its fixture field.
test('PostGIS transactions preserve recency, deduplicate evidence, reject quality and version boundary edits', {skip:process.env.CHM_INTEGRATION!=='1'}, async()=>{
 integrationDatabaseUrl(process.env.DATABASE_URL);
 assert.equal((await pool.query('select current_database() as name')).rows[0].name,'chm_integration');
 const polygon={type:'Polygon',coordinates:[[[77,28],[77.01,28],[77.01,28.01],[77,28.01],[77,28]]]};
 const account=(await pool.query("insert into app_users(email,password_hash) values($1,'unused') returning id,email",[`evidence-${randomUUID()}@example.invalid`])).rows[0];
 const field=(await pool.query(`insert into fields(name,crop,boundary_geom,location,owner_id) values('Evidence regression fixture','Unknown',ST_GeomFromGeoJSON($1),ST_SetSRID(ST_MakePoint(77,28),4326),$2) returning id`,[JSON.stringify(polygon),account.id])).rows[0];
 const originalFetch=globalThis.fetch;
 let releaseOld:()=>void=()=>{};
 let oldStarted:()=>void=()=>{};
 let releaseBoundary:()=>void=()=>{};
 let boundaryStarted:()=>void=()=>{};
 const oldReady=new Promise<void>(resolve=>{oldStarted=resolve;});
 const oldGate=new Promise<void>(resolve=>{releaseOld=resolve;});
 const boundaryReady=new Promise<void>(resolve=>{boundaryStarted=resolve;});
 const boundaryGate=new Promise<void>(resolve=>{releaseBoundary=resolve;});
 const dates:Record<string,string>={};
 try{
  for(const [scene,hours] of [['old',96],['new',48],['low',24],['changed',12]] as const){
   dates[scene]=new Date(Date.now()-hours*3600000).toISOString();
   await pool.query(`insert into satellite_scenes(field_id,scene_id,collection,observed_at,source,catalog_url,assets) values($1,$2,'sentinel-2-l2a',$3,'fixture','https://example.invalid',$4)`,[field.id,scene,dates[scene],JSON.stringify({red:{href:scene},nir:{href:'nir'},scl:{href:'scl'}})]);
  }
  globalThis.fetch=(async(_url:unknown,init:RequestInit)=>{
   const body=JSON.parse(init.body as string);
   if(body.redUrl==='old'){oldStarted();await oldGate;}
   if(body.redUrl==='changed'){boundaryStarted();await boundaryGate;}
   return new Response(JSON.stringify({ndvi:body.redUrl==='old'?.8:body.redUrl==='recovered'?.9:.6,ndmi:.3,ndre:null,savi:.6,evi:null,
    validPixels:body.redUrl==='low'?2:100,validCoverage:body.redUrl==='low'?20:90,minimum:.2,maximum:.8,median:.6,standardDeviation:.01,stressGeojson:null}));
  }) as typeof fetch;
  const older=processScene(field.id,'old');await oldReady;
  await processScene(field.id,'new');releaseOld();await older;
  let summary=(await pool.query('select latest_scene_id,last_observation,ndvi_average from fields where id=$1',[field.id])).rows[0];
  assert.equal(summary.latest_scene_id,'new');assert.equal(Number(summary.ndvi_average),.6);
  await processScene(field.id,'new');
  assert.equal((await pool.query('select count(*)::int as count from vegetation_indices where field_id=$1',[field.id])).rows[0].count,2);
  assert.equal((await pool.query('select count(*)::int as count from alerts where field_id=$1',[field.id])).rows[0].count,1);
  assert.equal((await processScene(field.id,'low')).accepted,false);
  summary=(await pool.query('select latest_scene_id from fields where id=$1',[field.id])).rows[0];assert.equal(summary.latest_scene_id,'new');
  // Skip the newest candidate for this fallback check; newest eligible is the low-quality scene.
  await pool.query("update satellite_scenes set observed_at=now()-interval '400 days' where field_id=$1 and scene_id='changed'",[field.id]);
  const latest=await processLatest(field.id);assert.equal(latest.accepted,true);assert.ok('sceneId' in latest);assert.equal(latest.sceneId,'new');
  assert.equal(latest.attempts[0].sceneId,'low');assert.equal(latest.attempts[0].status,'rejected');
  const recoveredAt=new Date(Date.now()-3600000).toISOString();
  await pool.query(`insert into satellite_scenes(field_id,scene_id,collection,observed_at,source,catalog_url,assets)
   values($1,'recovered','sentinel-2-l2a',$2,'fixture','https://example.invalid',$3)`,
   [field.id,recoveredAt,JSON.stringify({red:{href:'recovered'},nir:{href:'nir'},scl:{href:'scl'}})]);
  const recovered=await processScene(field.id,'recovered');assert.equal(recovered.accepted,true);
  summary=(await pool.query('select latest_scene_id from fields where id=$1',[field.id])).rows[0];
  assert.equal(summary.latest_scene_id,'recovered');
  assert.equal((await pool.query("select action_status from alerts where field_id=$1 and evidence_key like 'decline:%'",[field.id])).rows[0].action_status,'superseded');
  const changing=processScene(field.id,'changed');await boundaryReady;
  const edited={...polygon,coordinates:[[[77,28],[77.005,28],[77.005,28.005],[77,28.005],[77,28]]]};
  await pool.query('update fields set boundary_geom=ST_GeomFromGeoJSON($2) where id=$1',[field.id,JSON.stringify(edited)]);
  releaseBoundary();assert.equal((await changing).accepted,false);
  const version=(await pool.query('select boundary_version,latest_scene_id,last_observation from fields where id=$1',[field.id])).rows[0];
  assert.equal(version.boundary_version,2);assert.equal(version.latest_scene_id,null);assert.equal(version.last_observation,null);
  assert.equal((await pool.query('select count(*)::int as count from field_boundary_versions where field_id=$1',[field.id])).rows[0].count,2);
  assert.equal((await pool.query('select count(*)::int as count from vegetation_indices where field_id=$1 and boundary_version=1',[field.id])).rows[0].count,5);
  let responseFields:Array<{id:string;last_observation:string|null;assessment:{state:string}}> = [];
  await getFields({} as Request,{locals:{account},json(value:typeof responseFields){responseFields=value;},status(){throw new Error('Fields request failed');}} as unknown as Response);
  assert.equal(responseFields.find(item=>item.id===field.id)?.last_observation,null);
  assert.equal(responseFields.find(item=>item.id===field.id)?.assessment.state,'awaiting_analysis');
  const states=await pool.query('select scene_id,processing_status from satellite_scenes where field_id=$1',[field.id]);
  assert.ok(states.rows.every(row=>row.processing_status==='discovered'));
 }finally{
  releaseOld();releaseBoundary();globalThis.fetch=originalFetch;
  await pool.query('delete from fields where id=$1',[field.id]);
  await pool.query('delete from app_users where id=$1',[account.id]);
 }
});

test('field owners cannot read or mutate another account’s field through the API',{skip:process.env.CHM_INTEGRATION!=='1'},async()=>{
 integrationDatabaseUrl(process.env.DATABASE_URL);
 const previousAuthMode=process.env.AUTH_MODE;process.env.AUTH_MODE='required';
 const users=[randomUUID(),randomUUID()],fields:string[]=[randomUUID(),randomUUID()],tokens=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
 const polygon={type:'Polygon',coordinates:[[[77,28],[77.01,28],[77.01,28.01],[77,28.01],[77,28]]]};
 let server:ReturnType<typeof app.listen>|undefined;
 try{
  for(let index=0;index<2;index++){
   await pool.query('insert into app_users(id,email,password_hash) values($1,$2,$3)',[users[index],`ownership-${users[index]}@example.invalid`,'unused']);
   await pool.query('insert into app_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval \'5 minutes\')',[hashToken(tokens[index]),users[index]]);
   await pool.query(`insert into fields(id,name,crop,boundary_geom,location,owner_id) values($1,$2,'Unknown',ST_GeomFromGeoJSON($3),ST_SetSRID(ST_MakePoint(77,28),4326),$4)`,[fields[index],`Private field ${index}`,JSON.stringify(polygon),users[index]]);
  }
  server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server?.once('listening',resolve);server?.once('error',reject);});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}/api/fields`;
  const headers={cookie:`chm_session=${tokens[0]}`,origin:'http://localhost:5173'};
  const owned=await fetch(base,{headers});assert.equal(owned.status,200);
  const records=await owned.json() as Array<{id:string}>;assert.deepEqual(records.map(record=>record.id),[fields[0]]);
  // Optional field metadata must survive a partial edit; an explicit null clears it.
  const patchOwned = (body: Record<string, unknown>) => fetch(`${base}/${fields[0]}`, {
   method:'PATCH', headers:{...headers,'content-type':'application/json'}, body:JSON.stringify(body),
  });
  const dated = await patchOwned({planting_date:'2026-10-01',harvest_date:'2026-11-01',expected_yield_tons:5});
  assert.equal(dated.status,200);
  const renamed = await patchOwned({name:'Renamed owned field'});
  assert.equal(renamed.status,200);
  const retained = await renamed.json() as {planting_date:string|null;harvest_date:string|null;expected_yield_tons:string|number|null};
  assert.equal(retained.planting_date,'2026-10-01');assert.equal(retained.harvest_date,'2026-11-01');assert.equal(Number(retained.expected_yield_tons),5);
  const clearedResponse = await patchOwned({planting_date:null,harvest_date:null,expected_yield_tons:null});
  assert.equal(clearedResponse.status,200);
  const cleared = await clearedResponse.json() as typeof retained;
  assert.equal(cleared.planting_date,null);assert.equal(cleared.harvest_date,null);assert.equal(cleared.expected_yield_tons,null);
  for(const path of [`/${fields[1]}`,`/${fields[1]}/scenes`,`/${fields[1]}/alerts`,`/${fields[1]}/ndvi`,`/${fields[1]}/events`,`/${fields[1]}/scouting`,`/${fields[1]}/tasks`,`/${fields[1]}/jobs`]){
   const response=await fetch(base+path,{headers});assert.equal(response.status,404,path);
  }
  const queued=await fetch(`${base}/${fields[1]}/jobs`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({kind:'satellite'})});
  assert.equal(queued.status,404);
  const foreignUpload=await fetch(`${base}/${fields[1]}/scouting`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({client_key:randomUUID(),observed_on:'2026-10-16',image:'invalid'})});
  assert.equal(foreignUpload.status,404);
  const foreignPhoto=await fetch(`${base}/${fields[1]}/scouting/${randomUUID()}/photos/${randomUUID()}`,{headers});
  assert.equal(foreignPhoto.status,404);
  const foreignPreview=await fetch(`${base}/${fields[1]}/scouting/quality-preview`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({image:'invalid'})});
  assert.equal(foreignPreview.status,404);
  const privateVisit=await fetch(`${base}/${fields[1]}/tasks`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({client_key:randomUUID(),title:'Visit',reason:'Inspect',due_on:'2026-10-16',scene_id:null})});
  assert.equal(privateVisit.status,404);
  const assistant=await fetch(new URL('/api/assistant',base),{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({fieldId:fields[1],message:'Review the field'})});
  assert.equal(assistant.status,404);
  const patch=await fetch(`${base}/${fields[1]}/boundary`,{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({boundary_geojson:{...polygon,coordinates:[[[77,28],[77.005,28],[77.005,28.005],[77,28.005],[77,28]]]}})});
  assert.equal(patch.status,404);
  const crossOrigin=await fetch(`${base}/${fields[0]}/boundary`,{method:'PATCH',headers:{cookie:headers.cookie,origin:'https://attacker.invalid','content-type':'application/json'},body:'{}'});
  assert.equal(crossOrigin.status,403);
  const clientKey=randomUUID(),createBody={name:'Idempotent field',crop:'Unknown',boundary_geojson:polygon};
  const create=()=>fetch(base,{method:'POST',headers:{...headers,'content-type':'application/json','Idempotency-Key':clientKey},body:JSON.stringify(createBody)});
  const created=(await create());assert.equal(created.status,201);const createdField=await created.json() as {id:string};fields.push(createdField.id);
  const retried=(await create());assert.equal(retried.status,201);assert.equal((await retried.json() as {id:string}).id,createdField.id);
  assert.equal((await pool.query('select count(*)::int as count from fields where client_key=$1',[clientKey])).rows[0].count,1);
  // Two concurrent retries with one submission key should produce one case, photo and follow-up task.
  const photoKey=randomUUID();
  const jpeg='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDj6KKK8Y8Y/9k=';
  const image='data:image/jpeg;base64,'+jpeg;
  const originalPhotoFetch=globalThis.fetch;
  let inspectCount=0;
  try{
   globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    if(String(input).endsWith('/inspect-photo')){
     inspectCount++;
     return new Response(JSON.stringify({image:jpeg,width:2,height:3,quality:'acceptable'}),{status:200,headers:{'content-type':'application/json'}});
    }
    return originalPhotoFetch(input,init);
   }) as typeof fetch;
   const photoBody=JSON.stringify({client_key:photoKey,observed_on:'2026-10-16',image,notes:'Concurrent retry fixture',observation_category:'visual_symptom',growth_stage:'vegetative',severity:'moderate'});
   const upload=()=>originalPhotoFetch(`${base}/${fields[0]}/scouting`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:photoBody});
   const results=await Promise.all([upload(),upload()]);
   assert.ok(results.every(result=>[200,201].includes(result.status)),JSON.stringify(results.map(result=>result.status)));
   const saved=await Promise.all(results.map(result=>result.json())) as Array<{id:string;observation_category:string;growth_stage:string;severity:string;provenance:string;verification_status:string}>;
   assert.equal(saved[0].id,saved[1].id);
   assert.equal(saved[0].observation_category,'visual_symptom');assert.equal(saved[0].growth_stage,'vegetative');assert.equal(saved[0].severity,'moderate');
   assert.equal(saved[0].provenance,'owner_reported');assert.equal(saved[0].verification_status,'unverified');
   const counts=await pool.query(`select
    (select count(*)::int from scouting_cases where field_id=$1 and client_key=$2) as cases,
    (select count(*)::int from scouting_photos p join scouting_cases c on p.case_id=c.id where c.field_id=$1 and c.client_key=$2) as photos,
    (select count(*)::int from field_tasks t join scouting_cases c on t.case_id=c.id where c.field_id=$1 and c.client_key=$2) as tasks`,[fields[0],photoKey]);
   assert.equal(counts.rows[0].cases,1);
   assert.equal(counts.rows[0].photos,1);
   assert.equal(counts.rows[0].tasks,1);
   const record=(await pool.query('select reported_by,provenance,verification_status from scouting_cases where field_id=$1 and client_key=$2',[fields[0],photoKey])).rows[0];
   assert.equal(record.reported_by,users[0]);assert.equal(record.provenance,'owner_reported');assert.equal(record.verification_status,'unverified');
   const listed=await originalPhotoFetch(`${base}/${fields[0]}/scouting`,{headers});
   assert.equal(listed.status,200);
   const listedCases=await listed.json() as {cases:Array<Record<string,unknown>>};
   assert.equal(listedCases.cases[0].observation_category,'visual_symptom');
   assert.equal('reported_by' in listedCases.cases[0],false);assert.equal('reviewed_by' in listedCases.cases[0],false);
   // A successful response must have a real persisted JPEG and a readable, owner-scoped route.
   const persistedPhoto=(await pool.query(`select p.id,p.storage_key,p.width,p.height from scouting_photos p join scouting_cases c on c.id=p.case_id where c.field_id=$1 and c.client_key=$2`,[fields[0],photoKey])).rows[0];
   assert.equal(persistedPhoto.width,2);
   assert.equal(persistedPhoto.height,3);
   assert.deepEqual(await readFile(resolve(process.env.PHOTO_STORAGE_DIR||'.local/scouting-photos',persistedPhoto.storage_key)),Buffer.from(jpeg,'base64'));
   const served=await originalPhotoFetch(`${base}/${fields[0]}/scouting/${saved[0].id}/photos/${persistedPhoto.id}`,{headers});
   assert.equal(served.status,200);
   assert.match(served.headers.get('content-type')||'',/^image\/jpeg/);
   assert.equal(served.headers.get('x-content-type-options'),'nosniff');
   assert.deepEqual(Buffer.from(await served.arrayBuffer()),Buffer.from(jpeg,'base64'));
   // An idempotent retry after commit must verify the existing image without creating another case.
   const inspectionsBeforeRetry=inspectCount;
   const retry=await originalPhotoFetch(`${base}/${fields[0]}/scouting`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:photoBody});
   assert.equal(retry.status,200);
   const retriedCase=await retry.json() as {id:string;photos:Array<{id:string}>};
   assert.equal(retriedCase.id,saved[0].id);
   assert.equal(retriedCase.photos.length,1);
   assert.equal(retriedCase.photos[0].id,persistedPhoto.id);
   assert.ok(inspectCount>inspectionsBeforeRetry,'Existing photo is re-decoded before acknowledging the retry');
   // A duplicate must not return false success when its stored photo is missing.
   const storedPath=resolve(process.env.PHOTO_STORAGE_DIR||'.local/scouting-photos',persistedPhoto.storage_key);
   const savedBytes=await readFile(storedPath);
   await unlink(storedPath);
   try{
    const missing=await originalPhotoFetch(`${base}/${fields[0]}/scouting`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:photoBody});
    assert.equal(missing.status,503);
   }finally{await writeFile(storedPath,savedBytes);}
   // A corrupt stored image must likewise be rejected rather than acknowledged.
   await writeFile(storedPath,Buffer.from('corrupt image'));
   try{
    const corrupt=await originalPhotoFetch(`${base}/${fields[0]}/scouting`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:photoBody});
    assert.equal(corrupt.status,503);
   }finally{await writeFile(storedPath,savedBytes);}
   // A temporary decoder outage must not acknowledge the retry or delete committed rows/files.
   const beforeOutage=(await pool.query('select count(*)::int as n from scouting_photos where case_id=$1',[saved[0].id])).rows[0].n;
   const originalInspectionFetch=globalThis.fetch;
   try{
    globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
     if(String(input).endsWith('/inspect-photo'))throw new Error('Image engine temporarily offline');
     return originalInspectionFetch(input,init);
    }) as typeof fetch;
    const outage=await originalPhotoFetch(`${base}/${fields[0]}/scouting`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:photoBody});
    assert.equal(outage.status,503);
    assert.equal((await pool.query('select count(*)::int as n from scouting_photos where case_id=$1',[saved[0].id])).rows[0].n,beforeOutage);
    assert.deepEqual(await readFile(storedPath),savedBytes);
   }finally{globalThis.fetch=originalInspectionFetch;}
   // The other account cannot retrieve this owner's photo.
   const otherUser=await originalPhotoFetch(`${base}/${fields[0]}/scouting/${saved[0].id}/photos/${persistedPhoto.id}`,{
    headers:{cookie:`chm_session=${tokens[1]}`,origin:'http://localhost:5173'}
   });
   assert.equal(otherUser.status,404);
   // A valid photo ID must not be retrievable under an unrelated scouting case URL.
   const wrongCase=await originalPhotoFetch(`${base}/${fields[0]}/scouting/${randomUUID()}/photos/${persistedPhoto.id}`,{headers});
   assert.equal(wrongCase.status,404);
   assert.ok(inspectCount>=1);
  }finally{globalThis.fetch=originalPhotoFetch;}
  // An image-engine rejection must not persist any scouting case or follow-up task.
  const failedKey=randomUUID();
  const originalFailedFetch=globalThis.fetch;
  try{
   globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    if(String(input).endsWith('/inspect-photo'))return new Response(JSON.stringify({error:'Unreadable photo'}),{status:422,headers:{'content-type':'application/json'}});
    return originalFailedFetch(input,init);
   }) as typeof fetch;
   const failure=await originalFailedFetch(`${base}/${fields[0]}/scouting`,{
    method:'POST',headers:{...headers,'content-type':'application/json'},
    body:JSON.stringify({client_key:failedKey,observed_on:'2026-10-16',image:'data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,16,255,217]).toString('base64')})
   });
   assert.equal(failure.status,422);
   const persisted=await pool.query('select count(*)::int as count from scouting_cases where field_id=$1 and client_key=$2',[fields[0],failedKey]);
   assert.equal(persisted.rows[0].count,0);
  }finally{globalThis.fetch=originalFailedFetch;}
  const unchanged=(await pool.query('select boundary_version from fields where id=$1',[fields[1]])).rows[0];
  assert.equal(unchanged.boundary_version,1);
 }finally{
  if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
  const savedPhotoKeys=(await pool.query('select p.storage_key from scouting_photos p join scouting_cases c on c.id=p.case_id where c.field_id=any($1::uuid[])',[fields])).rows.map(row=>String(row.storage_key));
  await pool.query('delete from fields where id=any($1::uuid[])',[fields]);
  for(const storageKey of savedPhotoKeys){
   if(/^[0-9a-f-]{36}\.jpg$/i.test(storageKey))await unlink(resolve(process.env.PHOTO_STORAGE_DIR||'.local/scouting-photos',storageKey)).catch(()=>{});
  }
  await pool.query('delete from app_users where id=any($1::uuid[])',[users]);
  if(previousAuthMode===undefined)delete process.env.AUTH_MODE;else process.env.AUTH_MODE=previousAuthMode;
 }
});

test('durable jobs recover, deduplicate and reject stale-boundary work; visits are idempotent and field-scoped', {skip:process.env.CHM_INTEGRATION!=='1'}, async()=>{
 integrationDatabaseUrl(process.env.DATABASE_URL);
 const oldMode=process.env.AUTH_MODE;process.env.AUTH_MODE='required';
 const user=randomUUID(),token=randomBytes(32).toString('hex');
 let fieldId:string|undefined;let server:ReturnType<typeof app.listen>|undefined;
 try{
  await pool.query("insert into app_users(id,email,password_hash) values($1,$2,'unused')",[user,`workflow-${user}@example.invalid`]);
  await pool.query("insert into app_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '5 minutes')",[hashToken(token),user]);
  const polygon={type:'Polygon',coordinates:[[[77,28],[77.01,28],[77.01,28.01],[77,28.01],[77,28]]]};
  fieldId=(await pool.query("insert into fields(name,crop,boundary_geom,owner_id) values('Visit fixture','Wheat',ST_GeomFromGeoJSON($1),$2) returning id",[JSON.stringify(polygon),user])).rows[0].id;
  server=app.listen(0,'127.0.0.1');await new Promise<void>((resolve,reject)=>{server!.once('listening',resolve);server!.once('error',reject);});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}/api/fields/${fieldId}`;
  const headers={cookie:`chm_session=${token}`,origin:'http://localhost:5173','content-type':'application/json'};
  const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
  const requests=await Promise.all([post('/jobs',{kind:'satellite'}),post('/jobs',{kind:'satellite'})]);
  assert.deepEqual(requests.map(response=>response.status),[202,202]);
  const jobs=await Promise.all(requests.map(response=>response.json())) as Array<{id:string;lease_token?:unknown}>;
  assert.equal(jobs[0].id,jobs[1].id);assert.equal(jobs[0].lease_token,undefined);
  await pool.query("update ingestion_jobs set status='running',attempts=1,heartbeat_at=now()-interval '7 minutes',lease_token=$2 where id=$1",[jobs[0].id,randomUUID()]);
  let executions=0;
  await Promise.all([runOne(async()=>{executions++;return {accepted:true,sceneId:'fixture'};}),runOne(async()=>{executions++;return {accepted:true};})]);
  assert.equal(executions,1);
  const finished=(await pool.query('select status,attempts,result from ingestion_jobs where id=$1',[jobs[0].id])).rows[0];
  assert.equal(finished.status,'succeeded');assert.equal(finished.attempts,2);assert.equal(finished.result.accepted,true);
  const next=await (await post('/jobs',{kind:'satellite'})).json() as {id:string};
  await pool.query("update ingestion_jobs set max_attempts=1 where id=$1",[next.id]);
  await runOne(async()=>{throw new Error('Provider unavailable');});
  assert.equal((await pool.query('select status,progress from ingestion_jobs where id=$1',[next.id])).rows[0].status,'failed');
  const oldJob=await (await post('/jobs',{kind:'satellite'})).json() as {id:string};
  const smaller={type:'Polygon',coordinates:[[[77,28],[77.005,28],[77.005,28.005],[77,28.005],[77,28]]]};
  await pool.query('update fields set boundary_geom=ST_GeomFromGeoJSON($2) where id=$1',[fieldId,JSON.stringify(smaller)]);
  const newJob=await (await post('/jobs',{kind:'satellite'})).json() as {id:string;boundary_version:number};
  assert.notEqual(newJob.id,oldJob.id);assert.equal(newJob.boundary_version,2);
  assert.equal((await pool.query('select status from ingestion_jobs where id=$1',[oldJob.id])).rows[0].status,'failed');
  const key=randomUUID(),visit={client_key:key,title:'Check north corner',reason:'Vegetation change; inspect before treatment',due_on:new Date().toISOString().slice(0,10),scene_id:null};
  const first=await post('/tasks',visit);assert.equal(first.status,201);const firstTask=await first.json() as {id:string;boundary_version:number;reason:string};assert.equal(firstTask.boundary_version,2);
  const retried=await post('/tasks',{...visit,title:'Should not overwrite'});assert.equal(retried.status,201);assert.equal((await retried.json() as {id:string}).id,firstTask.id);
  assert.equal((await pool.query('select count(*)::int as count from field_tasks where field_id=$1',[fieldId])).rows[0].count,1);
  assert.equal((await pool.query('select title from field_tasks where id=$1',[firstTask.id])).rows[0].title,'Check north corner');
  assert.equal((await post('/tasks',{...visit,client_key:randomUUID(),due_on:'2026-02-30'})).status,400);
  assert.equal((await post('/tasks',{...visit,client_key:randomUUID(),scene_id:'another-field-scene'})).status,409);
  const list=await fetch(base+'/tasks',{headers});assert.equal((await list.json() as Array<unknown>).length,1);
 }finally{
  if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
  if(fieldId)await pool.query('delete from fields where id=$1',[fieldId]);
  await pool.query('delete from app_users where id=$1',[user]);
  if(oldMode===undefined)delete process.env.AUTH_MODE;else process.env.AUTH_MODE=oldMode;
 }
});

after(async()=>{await pool.end();});
