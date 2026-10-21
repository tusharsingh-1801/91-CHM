import type {Request,Response} from 'express';
import {pool} from '../db/pool.ts';
import {actor} from '../services/auth.ts';
import {growthStages,observationCategories,observationSeverities} from '../../../shared/inspection.ts';
import {RESEARCH_CONSENT_POLICY} from '../../../shared/research/consent.ts';
const allowed=<T extends string>(values:readonly T[],value:unknown):value is T=>typeof value==='string'&&values.includes(value as T);
const validDate=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&value<=new Date().toISOString().slice(0,10);

export async function setScoutingResearchConsent(request:Request,response:Response){
 const account=actor(response);
 if(!account){response.status(401).json({error:'Sign in to manage research consent'});return;}
 const consent=(request.body as {consented?:unknown}|undefined)?.consented;
 if(typeof consent!=='boolean'){response.status(400).json({error:'Choose whether to share this note for research field review'});return;}
 const client=await pool.connect();
 try{
  await client.query('begin');
  const record=(await client.query<{owner_id:string|null}>('select f.owner_id from scouting_cases c join fields f on f.id=c.field_id where c.id=$1 and c.field_id=$2 for update of c,f',[request.params.caseId,request.params.fieldId])).rows[0];
  if(!record||record.owner_id!==account.id){await client.query('rollback');response.status(404).json({error:'Scouting note not found'});return;}
  const latest=(await client.query<{action:string;policy_version:string}>('select action,policy_version from scouting_research_consent_events where case_id=$1 order by id desc limit 1',[request.params.caseId])).rows[0];
  const current=latest?.action==='consent'&&latest.policy_version===RESEARCH_CONSENT_POLICY;
  if(current!==consent){
   await client.query('insert into scouting_research_consent_events(case_id,owner_id,action,policy_version) values($1,$2,$3,$4)',[request.params.caseId,account.id,consent?'consent':'withdraw',RESEARCH_CONSENT_POLICY]);
  }
  await client.query('commit');
  response.setHeader('Cache-Control','no-store');
  response.json({consented:consent,policyVersion:RESEARCH_CONSENT_POLICY});
 }catch(error){
  await client.query('rollback').catch(()=>{});
  throw error;
 }finally{client.release();}
}

export async function listResearchReviewQueue(_request:Request,response:Response){
 const account=actor(response);
 if(!account){response.status(401).json({error:'Sign in to access research reviews'});return;}
 const result=await pool.query(`select c.id as case_id,c.observed_on,
  ST_Y(ST_PointOnSurface(f.boundary_geom))::float8 as latitude,ST_X(ST_PointOnSurface(f.boundary_geom))::float8 as longitude
  from scouting_cases c join fields f on f.id=c.field_id
  cross join lateral(select action,policy_version from scouting_research_consent_events e where e.case_id=c.id order by e.id desc limit 1) consent
  where consent.action='consent' and consent.policy_version=$1
  and not exists(select 1 from expert_inspection_reviews r where r.case_id=c.id and r.reviewer_id=$2)
  order by c.observed_on asc,c.created_at asc limit 100`,[RESEARCH_CONSENT_POLICY,account.id]);
 response.setHeader('Cache-Control','no-store');
 response.json({cases:result.rows});
}

export async function createExpertInspectionReview(request:Request,response:Response){
 const account=actor(response);
 if(!account){response.status(401).json({error:'Sign in to submit a research review'});return;}
 const body=(request.body??{}) as {observed_on?:unknown;observation_category?:unknown;growth_stage?:unknown;severity?:unknown;attest_ground_visit?:unknown};
 const visitDate=body.observed_on;
 if(!validDate(visitDate)||!allowed(observationCategories,body.observation_category)||!allowed(growthStages,body.growth_stage)||!allowed(observationSeverities,body.severity)||body.attest_ground_visit!==true){
  response.status(400).json({error:'Enter valid field-visit labels and confirm that you personally visited the field'});return;
 }
 const client=await pool.connect();
 try{
  await client.query('begin');
  const record=(await client.query<{field_id:string;observed_on:string}>('select field_id,observed_on from scouting_cases where id=$1 for update',[request.params.caseId])).rows[0];
  if(!record){await client.query('rollback');response.status(404).json({error:'Consented research case not found'});return;}
  if(visitDate<record.observed_on){await client.query('rollback');response.status(400).json({error:'A field visit cannot predate the reported observation'});return;}
  const consent=(await client.query<{action:string;policy_version:string}>('select action,policy_version from scouting_research_consent_events where case_id=$1 order by id desc limit 1',[request.params.caseId])).rows[0];
  if(consent?.action!=='consent'||consent.policy_version!==RESEARCH_CONSENT_POLICY){await client.query('rollback');response.status(404).json({error:'Consented research case not found'});return;}
  const result=await client.query(`insert into expert_inspection_reviews(case_id,field_id,reviewer_id,observed_on,observation_category,growth_stage,severity,review_basis)
   values($1,$2,$3,$4,$5,$6,$7,'ground_visit') returning id,observed_on,observation_category,growth_stage,severity,review_basis,created_at`,
  [request.params.caseId,record.field_id,account.id,visitDate,body.observation_category,body.growth_stage,body.severity]);
  await client.query('commit');
  response.status(201).json(result.rows[0]);
 }catch(error){
  await client.query('rollback').catch(()=>{});
  throw error;
 }finally{client.release();}
}
