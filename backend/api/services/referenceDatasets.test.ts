import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Request,Response} from 'express';
import {referenceOptions,referencePage,persistReference,type ReferenceResult} from './referenceDatasets.ts';
import {requireAccount,requireField} from './auth.ts';
import {pool} from '../db/pool.ts';
import {listReferenceDatasets} from '../controllers/referenceDatasetsController.ts';
test('reference input rejects unknown providers, impossible dates and unbounded requests',()=>{
 for(const input of [{providers:['invented']},{providers:['chirps','chirps']},{start:'2021-02-30'},{start:'2020-01-01',end:'2022-01-01'}])assert.throws(()=>referenceOptions(input));
 assert.equal(referenceOptions({providers:['worldcover'],start:'2021-01-01',end:'2021-01-31'}).providers[0],'worldcover');
 assert.equal(referenceOptions({providers:['fao-calendar'],fao_calendar_csv:'/tmp/calendar.csv'}).fao_calendar_csv,'/tmp/calendar.csv');
 assert.throws(()=>referenceOptions({providers:['fao-calendar'],fao_calendar_csv:''}));
 for(const input of [{limit:101},{offset:-1},{provider:'invented'}])assert.throws(()=>referencePage(input));
});
function response(account:unknown=null){return {locals:{account},statusCode:200,body:null as unknown,status(code:number){this.statusCode=code;return this;},json(body:unknown){this.body=body;return this;}};}
test('reference route guards deny anonymous and foreign-owner access',async()=>{
 const previous=process.env.AUTH_MODE,original=pool.query;process.env.AUTH_MODE='required';
 try{
  const anonymous=response();requireAccount({} as Request,anonymous as unknown as Response,()=>assert.fail('anonymous access'));assert.equal(anonymous.statusCode,401);
  pool.query=(async(_sql:string,params:unknown[])=>{assert.equal(params[1],'owner');return {rows:[],rowCount:0};}) as typeof pool.query;
  const foreign=response({id:'owner'});await requireField({params:{fieldId:'00000000-0000-0000-0000-000000000001'}} as unknown as Request,foreign as unknown as Response,()=>assert.fail('foreign access'));assert.equal(foreign.statusCode,404);
 }finally{pool.query=original;if(previous===undefined)delete process.env.AUTH_MODE;else process.env.AUTH_MODE=previous;}
});
test('reference API bounds pages and filters current boundary',async()=>{
 const original=pool.query;
 try{
  pool.query=(async(sql:string,params:unknown[])=>{assert.match(sql,/r.boundary_version=f.boundary_version/);assert.deepEqual(params,['field','chirps',2,0]);return {rows:[{id:1},{id:2}]};}) as typeof pool.query;
  const res=response();await listReferenceDatasets({params:{fieldId:'field'},query:{limit:'1',provider:'chirps'}} as unknown as Request,res as unknown as Response);
  assert.deepEqual(res.body,{items:[{id:1}],hasMore:true,limit:1,offset:0});
 }finally{pool.query=original;}
});
test('reference persistence never marks a changed boundary integrated',async()=>{
 const original=pool.query;const result:ReferenceResult={provider:'worldcover',status:'downloaded',source:'ESA',source_url:'https://esa-worldcover.org',version:'2021 v200',license:'CC BY 4.0',fetched_at:'2026-10-22T00:00:00Z',payload:{period:'2021'}};
 try{
  pool.query=(async(sql:string)=>{assert.match(sql,/boundary_version=\$2/);return {rows:[],rowCount:0};}) as typeof pool.query;
  await assert.rejects(persistReference({id:'field',boundary_version:2},result),/boundary changed/);
 }finally{pool.query=original;}
});
