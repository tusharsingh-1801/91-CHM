import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Request,Response,NextFunction} from 'express';
import {createExpertInspectionReview,setScoutingResearchConsent} from './researchController.ts';
import {requireFieldReviewer} from '../services/research.ts';
import {pool} from '../db/pool.ts';

const account={id:'00000000-0000-0000-0000-000000000001',email:'reviewer@example.test'};
const caseId='00000000-0000-0000-0000-000000000002';
const fieldId='00000000-0000-0000-0000-000000000003';
function response(accountValue:typeof account|null=account){
 return {statusCode:200,body:null as unknown,headers:{} as Record<string,string>,locals:{account:accountValue},
  status(code:number){this.statusCode=code;return this;},json(body:unknown){this.body=body;return this;},
  setHeader(name:string,value:string){this.headers[name]=value;}};
}
function request(body:unknown={},params={caseId,fieldId}){return {body,params} as unknown as Request;}

test('research consent requires an account and explicit boolean choice',async()=>{
 const anonymous=response(null);await setScoutingResearchConsent(request({consented:true}),anonymous as unknown as Response);
 assert.equal(anonymous.statusCode,401);
 const invalid=response();await setScoutingResearchConsent(request({consented:'yes'}),invalid as unknown as Response);
 assert.equal(invalid.statusCode,400);
});

test('only the field owner can record research consent',async()=>{
 const original=pool.connect;
 const queries:Array<{sql:string;values?:unknown[]}>=[];let released=false;
 pool.connect=(async()=>({query:async(sql:string,values?:unknown[])=>{
  queries.push({sql,values});
  if(sql.startsWith('select f.owner_id'))return {rows:[{owner_id:'00000000-0000-0000-0000-000000000099'}]};
  return {rows:[],rowCount:1};
 },release(){released=true;}})) as typeof pool.connect;
 try{
  const res=response();await setScoutingResearchConsent(request({consented:true}),res as unknown as Response);
  assert.equal(res.statusCode,404);assert.equal(queries.some(query=>query.sql.startsWith('insert into scouting_research_consent_events')),false);
  assert.equal(released,true);
 }finally{pool.connect=original;}
});

test('review endpoint requires an explicit ground-visit attestation and ignores supplied reviewer identity',async()=>{
 const invalid=response();
 await createExpertInspectionReview(request({observed_on:'2026-10-19',observation_category:'visual_symptom',growth_stage:'vegetative',severity:'moderate'}),invalid as unknown as Response);
 assert.equal(invalid.statusCode,400);
 const original=pool.connect;const queries:Array<{sql:string;values?:unknown[]}>=[];
 pool.connect=(async()=>({query:async(sql:string,values?:unknown[])=>{
  queries.push({sql,values});
  if(sql.startsWith('select field_id'))return {rows:[{field_id:fieldId}]};
  if(sql.startsWith('select action'))return {rows:[{action:'consent',policy_version:'field-visit-v1'}]};
  if(sql.startsWith('insert into expert_inspection_reviews'))return {rows:[{id:'review-id',review_basis:'ground_visit'}]};
  return {rows:[],rowCount:1};
 },release(){}})) as typeof pool.connect;
 try{
  const res=response();await createExpertInspectionReview(request({observed_on:'2026-10-19',observation_category:'visual_symptom',growth_stage:'vegetative',severity:'moderate',attest_ground_visit:true,reviewer_id:'forged'}),res as unknown as Response);
  assert.equal(res.statusCode,201);
  const insert=queries.find(query=>query.sql.startsWith('insert into expert_inspection_reviews'));
  assert.ok(insert);assert.equal(insert.values?.[2],account.id);assert.doesNotMatch(insert.sql,/reviewer_id\s*=\s*\$/);
  assert.deepEqual(res.body,{id:'review-id',review_basis:'ground_visit'});
 }finally{pool.connect=original;}
});

test('review-role middleware rejects anonymous and unassigned accounts',async()=>{
 const original=pool.query;
 try{
  const anonymous=response(null);let anonymousNext=false;
  requireFieldReviewer({} as Request,anonymous as unknown as Response,(()=>{anonymousNext=true;}) as NextFunction);
  assert.equal(anonymous.statusCode,401);assert.equal(anonymousNext,false);
  pool.query=(async()=>({rows:[],rowCount:0})) as unknown as typeof pool.query;
  const unassigned=response();let unassignedNext=false;
  requireFieldReviewer({} as Request,unassigned as unknown as Response,((error?:unknown)=>{unassignedNext=true;assert.equal(error,undefined);}) as NextFunction);
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(unassigned.statusCode,403);assert.equal(unassignedNext,false);
  pool.query=(async()=>({rows:[{'?column?':1}],rowCount:1})) as unknown as typeof pool.query;
  const assigned=response();let assignedNext=false;
  await new Promise<void>(resolve=>requireFieldReviewer({} as Request,assigned as unknown as Response,((error?:unknown)=>{assert.equal(error,undefined);assignedNext=true;resolve();}) as NextFunction));
  assert.equal(assignedNext,true);
 }finally{pool.query=original;}
});
