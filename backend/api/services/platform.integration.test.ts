import {test,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import type {Request,Response} from 'express';
import {askAssistant} from '../controllers/assistantController.ts';
import {pool} from '../db/pool.ts';import {syncNotifications,listNotifications,readNotifications,saveNotificationPreferences} from './notifications.ts';import {assistantHistory} from './assistantHistory.ts';import {forecastFor} from './forecast.ts';import {createFieldEvent} from '../controllers/fieldsController.ts';
import {createExpertInspectionReview,listResearchReviewQueue,setScoutingResearchConsent} from '../controllers/researchController.ts';
const enabled=process.env.CHM_INTEGRATION==='1';
after(async()=>{await pool.end();});
async function invoke(handler:(request:Request,response:Response)=>Promise<void>,account:{id:string;email:string},body:unknown={},params:Record<string,string>={},query:Record<string,string>={}){let status=200;let payload:any;await handler({body,params,query} as unknown as Request,{locals:{account},status(code:number){status=code;return this;},json(value:unknown){payload=value;},setHeader(){}} as unknown as Response);return {status,payload};}
test('platform persistence isolates owners, deduplicates notices and notes, and caches real-mode forecasts',{skip:!enabled},async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.pathname,'/chm_integration');
 const users:string[]=[];const fields:string[]=[];const original=globalThis.fetch;
 try{
  for(let i=0;i<2;i++){users.push((await pool.query("insert into app_users(email,password_hash) values($1,'unused') returning id",[`platform-${randomUUID()}@example.invalid`])).rows[0].id);fields.push((await pool.query("insert into fields(name,crop,owner_id,provenance,location) values('Platform fixture','Wheat',$1,'user_reported',ST_SetSRID(ST_MakePoint(77,28),4326)) returning id",[users[i]])).rows[0].id);}
  const inspection=(await pool.query(`insert into scouting_cases(field_id,client_key,observed_on,boundary_version,observation_category,growth_stage,severity,provenance,verification_status,reported_by)
   values($1,$2,current_date,1,'visual_symptom','vegetative','moderate','owner_reported','unverified',$3) returning observation_category,growth_stage,severity,provenance,verification_status,reported_by,reviewed_by,reviewed_at`,[fields[0],randomUUID(),users[0]])).rows[0];
  assert.equal(inspection.observation_category,'visual_symptom');assert.equal(inspection.growth_stage,'vegetative');assert.equal(inspection.severity,'moderate');
  assert.equal(inspection.provenance,'owner_reported');assert.equal(inspection.verification_status,'unverified');assert.equal(inspection.reported_by,users[0]);assert.equal(inspection.reviewed_by,null);assert.equal(inspection.reviewed_at,null);
  const account={id:users[0],email:'fixture@example.invalid'};
  await pool.query("insert into field_tasks(field_id,title,due_on) values($1,'Visit',current_date)",[fields[0]]);
  await pool.query("insert into ingestion_jobs(field_id,owner_id,boundary_version,kind,status) values($1,$2,1,'satellite','failed')",[fields[0],users[0]]);
  let calls=0;
  globalThis.fetch=(async()=>{calls++;const days=Array.from({length:7},(_,i)=>new Date(Date.now()+i*86400000).toISOString().slice(0,10));return new Response(JSON.stringify({timezone:'Asia/Kolkata',daily:{time:days,temperature_2m_min:Array(7).fill(20),temperature_2m_max:Array(7).fill(30),precipitation_sum:Array(7).fill(25),precipitation_probability_max:Array(7).fill(80)}}));}) as typeof fetch;
  const forecast=await forecastFor(fields[0]);assert.equal(forecast.days.length,7);await forecastFor(fields[0]);assert.equal(calls,1);
  await syncNotifications(users[0]);await syncNotifications(users[0]);const list=await invoke(listNotifications,account);assert.equal(list.payload.notifications.length,4);
  const other={id:users[1],email:'other@example.invalid'};await syncNotifications(users[1]);const otherList=await invoke(listNotifications,other);assert.equal(otherList.payload.notifications.length,1);
  await invoke(readNotifications,other,{ids:[list.payload.notifications[0].id]});assert.equal((await pool.query('select read_at from account_notifications where id=$1',[list.payload.notifications[0].id])).rows[0].read_at,null);
  assert.equal((await invoke(saveNotificationPreferences,account,{browser:'yes'})).status,400);
  await invoke(saveNotificationPreferences,account,{imagery:false,browser:false});assert.equal((await invoke(listNotifications,account)).payload.preferences.imagery,false);
  const client_key=randomUUID(),body={event_type:'scouting',event_date:new Date().toISOString().slice(0,10),notes:'Offline replay test',client_key};
  const first=await invoke(createFieldEvent,account,body,{fieldId:fields[0]}),second=await invoke(createFieldEvent,account,body,{fieldId:fields[0]});assert.equal(first.status,201);assert.equal(second.payload.id,first.payload.id);assert.equal((await pool.query('select count(*)::int n from field_events where field_id=$1 and client_key=$2',[fields[0],client_key])).rows[0].n,1);
  const previousKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture-key';
  let assistantRequest:{systemInstruction:{parts:Array<{text:string}>};contents:Array<{role:string;parts:Array<{text:string}>}>}|undefined;
  globalThis.fetch=(async(_input,init)=>{assistantRequest=JSON.parse(String(init?.body));return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'A controlled fixture reply.'}]}}],modelVersion:'fixture'}));}) as typeof fetch;
  try{
   const answer=await invoke(askAssistant,account,{message:'Review this field',fieldId:fields[0],saveHistory:true});
   assert.equal(answer.status,200);assert.equal(answer.payload.historySaved,true);
   const systemPrompt=assistantRequest?.systemInstruction.parts[0]?.text??'';
   const fieldContext=assistantRequest?.contents.find(message=>message.role==='user'&&message.parts[0]?.text.includes('Field context:'))?.parts[0]?.text??'';
   assert.match(systemPrompt,/scouting stages\/symptoms are account-reported and unverified/);
   assert.match(fieldContext,/accountReportedScouting/);assert.match(fieldContext,/visual_symptom/);assert.match(fieldContext,/owner_reported/);
   assert.doesNotMatch(fieldContext,/reported_by|reviewed_by/);
   const history=await invoke(assistantHistory,account,{}, {},{fieldId:fields[0]});assert.deepEqual(history.payload.map((item:{role:string})=>item.role),['user','assistant']);
  }finally{if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;}
  await pool.query("insert into assistant_messages(owner_id,field_id,role,content) values($1,$2,'user','Private fixture')",[users[0],fields[0]]);
  assert.equal((await invoke(assistantHistory,other,{}, {},{fieldId:fields[0]})).status,404);
  const privateHistory=await invoke(assistantHistory,account,{}, {},{fieldId:fields[0]});
  assert.ok(privateHistory.payload.some((item:{content:string})=>item.content==='Private fixture'));
 }finally{globalThis.fetch=original;if(fields.length)await pool.query('delete from fields where id=any($1::uuid[])',[fields]);if(users.length)await pool.query('delete from app_users where id=any($1::uuid[])',[users]);}
});

test('research reviews require owner consent and store independent reviewer labels',{skip:!enabled},async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['localhost','127.0.0.1'].includes(url.hostname));assert.equal(url.pathname,'/chm_integration');
 const users:string[]=[];let field:string|undefined;
 try{
  for(const email of [`research-owner-${randomUUID()}@example.invalid`,`research-reviewer-${randomUUID()}@example.invalid`]){
   users.push((await pool.query("insert into app_users(email,password_hash) values($1,'unused') returning id",[email])).rows[0].id);
  }
  const createdField=(await pool.query("insert into fields(name,crop,owner_id,provenance,location) values('Research consent fixture','Wheat',$1,'user_reported',ST_SetSRID(ST_MakePoint(77,28),4326)) returning id",[users[0]])).rows[0].id as string;
  field=createdField;
  const createdCase=(await pool.query(`insert into scouting_cases(field_id,client_key,observed_on,boundary_version,observation_category,growth_stage,severity,provenance,verification_status,reported_by)
   values($1,$2,current_date,1,'visual_symptom','vegetative','moderate','owner_reported','unverified',$3) returning id`,[createdField,randomUUID(),users[0]])).rows[0].id as string;
  await pool.query("insert into research_role_grants(user_id,role) values($1,'field_reviewer')",[users[1]]);
  const owner={id:users[0],email:'owner@example.invalid'},reviewer={id:users[1],email:'reviewer@example.invalid'};
  assert.equal((await invoke(listResearchReviewQueue,reviewer)).payload.cases.length,0);
  const consent=await invoke(setScoutingResearchConsent,owner,{consented:true},{fieldId:createdField,caseId:createdCase});
  assert.equal(consent.status,200);assert.equal(consent.payload.consented,true);
  const queue=await invoke(listResearchReviewQueue,reviewer);
  assert.equal(queue.payload.cases.length,1);assert.equal(queue.payload.cases[0].case_id,createdCase);
  assert.equal('notes' in queue.payload.cases[0],false);assert.equal('reported_by' in queue.payload.cases[0],false);assert.equal('field_name' in queue.payload.cases[0],false);assert.equal('reported_category' in queue.payload.cases[0],false);
  await invoke(setScoutingResearchConsent,owner,{consented:true},{fieldId:createdField,caseId:createdCase});
  assert.equal((await pool.query('select count(*)::int n from scouting_research_consent_events where case_id=$1',[createdCase])).rows[0].n,1);
  const reviewed=await invoke(createExpertInspectionReview,reviewer,{observed_on:new Date().toISOString().slice(0,10),observation_category:'general_observation',growth_stage:'flowering',severity:'mild',attest_ground_visit:true},{caseId:createdCase});
  assert.equal(reviewed.status,201);assert.equal(reviewed.payload.review_basis,'ground_visit');
  await assert.rejects(pool.query('update expert_inspection_reviews set severity=$1 where id=$2',['severe',reviewed.payload.id]),{code:'55000'});
  await assert.rejects(pool.query('update scouting_research_consent_events set action=$1 where case_id=$2',['withdraw',createdCase]),{code:'55000'});
  const withdrawn=await invoke(setScoutingResearchConsent,owner,{consented:false},{fieldId:createdField,caseId:createdCase});
  assert.equal(withdrawn.payload.consented,false);
  assert.equal((await invoke(listResearchReviewQueue,reviewer)).payload.cases.length,0);
  assert.equal((await pool.query('select count(*)::int n from expert_inspection_reviews where case_id=$1',[createdCase])).rows[0].n,1);
 }finally{
  if(field)await pool.query('delete from fields where id=$1',[field]);
  if(users.length)await pool.query('delete from app_users where id=any($1::uuid[])',[users]);
 }
});
