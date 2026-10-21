import type {Request,Response} from 'express';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pool} from '../db/pool.ts';
import {growthStages, observationCategories, observationSeverities} from '../../../shared/inspection.ts';
import {RESEARCH_CONSENT_POLICY} from '../../../shared/research/consent.ts';
import {engineUrl} from '../services/satellite.ts';
import {decodeScoutingImage,validSanitizedJpeg} from '../services/photoValidation.ts';
import {shouldRemoveFailedUploadPhoto,rollbackBeforeCommit,reconcileScoutingCommit,storedJpegDecodes} from '../services/scoutingRecovery.ts';
const storage=resolve(process.env.PHOTO_STORAGE_DIR||'.local/scouting-photos');
const scoutingCaseColumns='id,field_id,client_key,observed_on,crop,symptoms,notes,latitude,longitude,follow_up,scene_id,boundary_version,diagnosis_status,diagnosis,created_at,observation_category,growth_stage,severity,provenance,verification_status';
export const diagnosisAvailability=()=>({status:'unavailable',provider:null,reason:'No licensed, validated crop-photo diagnosis provider is configured. Photos and scouting remain available; no diagnosis or treatment is inferred.'});
function isAllowed<T extends string>(values:readonly T[],value:unknown):value is T{
 return typeof value==='string'&&values.includes(value as T);
}
export async function previewScoutingPhoto(request:Request,response:Response){
 const image=(request.body as {image?:unknown}|undefined)?.image;
 if(typeof image!=='string'||!decodeScoutingImage(image)){
  response.status(400).json({error:'Choose a JPEG, PNG or WebP image under 5 MB.'});return;
 }
 try{
  const upstream=await fetch(`${engineUrl()}/inspect-photo`,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({image:image.slice(image.indexOf(',')+1)}),
   signal:AbortSignal.timeout(15000)
  });
  if(!upstream.ok){response.status(422).json({error:'The image could not be checked. Use a clear JPEG, PNG or WebP under 5 MB.'});return;}
  const inspected=await upstream.json() as {assessment?:{status:string;issues:string[];suggestions:string[];width:number;height:number;metrics:Record<string,number>;disclaimer:string}};
  if(!inspected.assessment||!Array.isArray(inspected.assessment.issues)){
   response.status(502).json({error:'Photo quality information is unavailable.'});return;
  }
  // Never return the decoded/resized image data from the inspection endpoint.
  response.setHeader('Cache-Control','no-store');
  response.json(inspected.assessment);
 }catch(error){
  console.error('Photo quality preview unavailable:',error instanceof Error?error.message:'unknown');
  response.status(503).json({error:'Photo quality check is temporarily unavailable. You can still save the scouting note.'});
 }
}
export async function listScouting(request:Request,response:Response){
 const result=await pool.query(`select ${scoutingCaseColumns},
  coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'width',p.width,'height',p.height,'quality',p.quality)) from scouting_photos p where p.case_id=scouting_cases.id),'[]'::jsonb) photos,
  coalesce((select action='consent' and policy_version=$2 from scouting_research_consent_events e where e.case_id=scouting_cases.id order by e.id desc limit 1),false) research_consent
  from scouting_cases where field_id=$1 order by observed_on desc,created_at desc`,[request.params.fieldId,RESEARCH_CONSENT_POLICY]);response.json({cases:result.rows,diagnosis:diagnosisAvailability()});
}
type StoredScoutingPhoto={id:string;width:number;height:number;quality:string;storage_key:string};
async function confirmedScoutingPhotos(caseId:string):Promise<Array<{id:string;width:number;height:number;quality:string}>|null>{
 const rows=(await pool.query('select id,width,height,quality,storage_key from scouting_photos where case_id=$1',[caseId])).rows as StoredScoutingPhoto[];
 if(rows.length===0)return null;
 const verified=await Promise.all(rows.map(photo=>storedJpegDecodes(storage,photo.storage_key,photo.width,photo.height,engineUrl())));
 if(!verified.every(Boolean))return null;
 return rows.map(({id,width,height,quality})=>({id,width,height,quality}));
}
export async function saveScouting(request:Request,response:Response){
 const body=(request.body ?? {}) as {client_key?:string;observed_on?:string;crop?:string;symptoms?:string;notes?:string;image?:string;follow_up?:string|null;latitude?:number;longitude?:number;scene_id?:string;observation_category?:unknown;growth_stage?:unknown;severity?:unknown};
 const observationCategory=body.observation_category===undefined?'unknown':body.observation_category;
 const growthStage=body.growth_stage===undefined?'unknown':body.growth_stage;
 const severity=body.severity===undefined?'not_applicable':body.severity;
 if(!isAllowed(observationCategories,observationCategory)||!isAllowed(growthStages,growthStage)||!isAllowed(observationSeverities,severity)){
  response.status(400).json({error:'Choose a supported observation category, growth stage and severity'});return;
 }
 if(!body.client_key||!/^[-a-f0-9]{36}$/i.test(body.client_key)||!body.observed_on||!/^\d{4}-\d{2}-\d{2}$/.test(body.observed_on)||!Number.isFinite(Date.parse(body.observed_on))||new Date(body.observed_on).toISOString().slice(0,10)!==body.observed_on||body.observed_on>new Date().toISOString().slice(0,10)||[body.crop,body.symptoms,body.notes].some(value=>value!==undefined&&(typeof value!=='string'||value.length>4000))){response.status(400).json({error:'Choose a valid observation date and notes under 4,000 characters'});return;}
 if(body.follow_up&&(!/^\d{4}-\d{2}-\d{2}$/.test(body.follow_up)||!Number.isFinite(Date.parse(body.follow_up)))){response.status(400).json({error:'Use a valid follow-up date'});return;}
 if(body.latitude!==undefined&&(!Number.isFinite(body.latitude)||Math.abs(body.latitude)>90||!Number.isFinite(body.longitude)||Math.abs(body.longitude!)>180)){response.status(400).json({error:'Use valid GPS coordinates or omit location'});return;}
 const existing=(await pool.query(`select ${scoutingCaseColumns} from scouting_cases where field_id=$1 and client_key=$2`,[request.params.fieldId,body.client_key])).rows[0];
 if(existing){const photos=await confirmedScoutingPhotos(existing.id);if(!photos){response.status(503).json({error:'Saved scouting photo could not be verified. Keep the original photo and contact support; do not create a new submission key.'});return;}response.json({...existing,photos});return;}
 if(typeof body.image!=='string'||!decodeScoutingImage(body.image)){response.status(400).json({error:'Upload a JPEG, PNG or WebP photo under 5 MB'});return;}
 let storageKey:string|undefined;
 let commitAttempted=false;
 try{
  const inspection=await fetch(`${engineUrl()}/inspect-photo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:body.image.split(',')[1]}),signal:AbortSignal.timeout(20000)});
  if(!inspection.ok){response.status(422).json({error:'Photo could not be decoded safely. Use JPEG, PNG or WebP under 5 MB.'});return;}
  const photo=await inspection.json() as {image:string;width:number;height:number;quality:string};
  const bytes=validSanitizedJpeg(photo.image,photo.width,photo.height);if(!bytes)throw new Error('Invalid image sanitizer output');
  storageKey=randomUUID()+'.jpg';await mkdir(storage,{recursive:true,mode:0o700});await writeFile(resolve(storage,storageKey),bytes,{mode:0o600,flag:'wx'});
  const client=await pool.connect();
  try{await client.query('begin');
   const field=(await client.query('select boundary_version from fields where id=$1 for share',[request.params.fieldId])).rows[0];if(!field)throw new Error('Field no longer exists');
   const reporterId=response.locals.account?.id;
   if(typeof reporterId!=='string')throw new Error('Authenticated reporter identity is unavailable');
   const result=await client.query(`insert into scouting_cases(field_id,client_key,observed_on,crop,symptoms,notes,latitude,longitude,follow_up,scene_id,boundary_version,diagnosis,observation_category,growth_stage,severity,provenance,verification_status,reported_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'owner_reported','unverified',$16) on conflict(field_id,client_key) do nothing returning ${scoutingCaseColumns}`,[request.params.fieldId,body.client_key,body.observed_on,body.crop||null,body.symptoms||null,body.notes||null,body.latitude??null,body.longitude??null,body.follow_up||null,body.scene_id||null,field.boundary_version,JSON.stringify(diagnosisAvailability()),observationCategory,growthStage,severity,reporterId]);
   if(!result.rowCount){await client.query('rollback');await unlink(resolve(storage,storageKey)).catch(()=>{});storageKey=undefined;const duplicate=(await pool.query(`select ${scoutingCaseColumns} from scouting_cases where field_id=$1 and client_key=$2`,[request.params.fieldId,body.client_key])).rows[0];const photos=duplicate?await confirmedScoutingPhotos(duplicate.id):null;if(!photos){response.status(503).json({error:'Existing scouting upload could not be verified. Keep the original photo and submission key.'});return;}response.json({...duplicate,photos});return;}
   const item=result.rows[0];const photoRecord=(await client.query(`insert into scouting_photos(case_id,storage_key,mime,width,height,quality) values($1,$2,'image/jpeg',$3,$4,$5) returning id,width,height,quality`,[item.id,storageKey,photo.width,photo.height,photo.quality])).rows[0];
   await client.query(`insert into field_tasks(field_id,case_id,title,due_on) values($1,$2,'Follow up on crop photo and inspect the field',$3)`,[request.params.fieldId,item.id,body.follow_up||body.observed_on]);
   commitAttempted=true;
   await client.query('commit');response.status(201).json({...item,photos:[photoRecord],quality:photo.quality,diagnosis:diagnosisAvailability()});
  }catch(error){await rollbackBeforeCommit(sql=>client.query(sql),commitAttempted,rollbackError=>console.error('Scouting rollback failed:',rollbackError));throw error;}finally{client.release();}
 }catch(error){
  // A failed COMMIT can have an unknown outcome. Keep the photo so any committed row still points to a valid file.
  if(shouldRemoveFailedUploadPhoto(Boolean(storageKey),commitAttempted)&&storageKey)await unlink(resolve(storage,storageKey)).catch(()=>{});
  console.error('Scouting upload',error);
  if(commitAttempted){
   const reconciled=await reconcileScoutingCommit(async()=>{
    const item=(await pool.query('select * from scouting_cases where field_id=$1 and client_key=$2',[request.params.fieldId,body.client_key])).rows[0];
    if(!item)return null;
    const photoRows=(await pool.query('select id,width,height,quality,storage_key from scouting_photos where case_id=$1',[item.id])).rows as Array<{id:string;width:number;height:number;quality:string;storage_key:string}>;
    const readable=await Promise.all(photoRows.map(photo=>storedJpegDecodes(storage,photo.storage_key,photo.width,photo.height,engineUrl())));
    if(!readable.some(Boolean))return null;
    const photos=photoRows.map(({id,width,height,quality})=>({id,width,height,quality}));
    return {...item,photos};
   },result=>Array.isArray(result.photos)&&result.photos.some((photo:{id:string})=>typeof photo.id==='string'));
   if(reconciled.status==='committed'){response.json(reconciled.value);return;}
  }
  response.status(503).json({error:'Photo save could not be confirmed. Keep your draft and retry with the same submission key.'});
 }
}
export async function photoContent(request:Request,response:Response){
 const photo=(await pool.query(`select p.storage_key from scouting_photos p join scouting_cases c on c.id=p.case_id where p.id=$1 and c.field_id=$2 and c.id=$3`,[request.params.photoId,request.params.fieldId,request.params.caseId])).rows[0];
 if(!photo){response.status(404).json({error:'Photo not found'});return;}
 const key=String(photo.storage_key);if(!/^[a-f0-9-]{36}\.jpg$/.test(key)){response.status(404).end();return;}
 try{const data=await readFile(resolve(storage,key));response.set({'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Cache-Control':'no-store'}).send(data);}catch{response.status(404).json({error:'Photo file unavailable'});}
}
export async function deleteScouting(request:Request,response:Response){
 const client=await pool.connect();let keys:string[]=[];
 try{await client.query('begin');const item=(await client.query('select id from scouting_cases where id=$1 and field_id=$2 for update',[request.params.caseId,request.params.fieldId])).rows[0];if(!item){await client.query('rollback');response.status(404).json({error:'Scouting case not found'});return;}
 keys=(await client.query('select storage_key from scouting_photos where case_id=$1',[item.id])).rows.map(row=>String(row.storage_key));await client.query('delete from scouting_cases where id=$1',[item.id]);await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 await Promise.all(keys.filter(key=>/^[a-f0-9-]{36}\.jpg$/.test(key)).map(key=>unlink(resolve(storage,key)).catch(()=>{})));response.status(204).end();
}
export async function retryDiagnosis(request:Request,response:Response){const item=(await pool.query('select id from scouting_cases where id=$1 and field_id=$2',[request.params.caseId,request.params.fieldId])).rows[0];if(!item){response.status(404).json({error:'Scouting case not found'});return;}response.json(diagnosisAvailability());}
export async function listTasks(request:Request,response:Response){response.json((await pool.query('select * from field_tasks where field_id=$1 order by due_on nulls last,created_at desc',[request.params.fieldId])).rows);}
export async function updateTask(request:Request,response:Response){const status=request.body?.status;if(!['open','acknowledged','action_taken','resolved'].includes(status)){response.status(400).json({error:'Choose a supported task state'});return;}
 const result=await pool.query(`update field_tasks set status=$3,completed_at=case when $3='resolved' then now() else null end where id=$1 and field_id=$2 returning *`,[request.params.taskId,request.params.fieldId,status]);if(!result.rowCount){response.status(404).json({error:'Task not found'});return;}response.json(result.rows[0]);}
