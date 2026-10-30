import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Request,Response} from 'express';
import {getDistrictApyFilters,listDistrictApy} from './districtApyController.ts';
import {pool} from '../db/pool.ts';

function responseCapture(){
 let payload:unknown;
 let statusCode=200;
 return {
  response:{
   json(value:unknown){payload=value;return this;},
   status(value:number){statusCode=value;return this;},
  } as unknown as Response,
  payload:()=>payload,
  statusCode:()=>statusCode,
 };
}

test('district APY filters match state and source without case sensitivity',async()=>{
 const originalQuery=pool.query;
 const calls:{sql:string;values:unknown[]}[]=[];
 pool.query=(async(sql:string,values:unknown[]=[])=>{
  calls.push({sql,values});
  return {rows:[]} as never;
 }) as typeof pool.query;
 const capture=responseCapture();
 try{
  await getDistrictApyFilters({query:{state:'uTtAr PrAdEsH',source:'UPAG'}} as unknown as Request,capture.response);
  assert.equal(capture.statusCode(),200);
  const districtQuery=calls.find(call=>call.sql.includes('distinct district_name'));
  assert.ok(districtQuery?.sql.includes('lower(state_name)=lower($1)'));
  assert.ok(districtQuery?.sql.includes('lower(source_id)=lower($2)'));
  assert.deepEqual(districtQuery?.values,['uTtAr PrAdEsH','upag']);
  assert.ok(calls.every(call=>!call.sql.includes('source_id=$1')));
 }finally{pool.query=originalQuery;}
});

test('district APY records match state, district, crop, and source without case sensitivity',async()=>{
 const originalQuery=pool.query;
 let call:{sql:string;values:unknown[]}|undefined;
 pool.query=(async(sql:string,values:unknown[]=[])=>{
  call={sql,values};
  return {rows:[]} as never;
 }) as typeof pool.query;
 const capture=responseCapture();
 try{
  await listDistrictApy({query:{
   state:'uTtAr PrAdEsH',
   district:'lUcKnOw',
   crop:'wHeAt',
   source:'UPAG',
   year_from:'2024-2025',
   year_to:'2024-2025',
  }} as unknown as Request,capture.response);
  assert.equal(capture.statusCode(),200);
  assert.ok(call?.sql.includes('lower(state_name)=lower($1)'));
  assert.ok(call?.sql.includes('lower(district_name)=lower($2)'));
  assert.ok(call?.sql.includes('lower(crop_name)=lower($3)'));
  assert.ok(call?.sql.includes('lower(source_id)=lower($4)'));
  assert.deepEqual(call?.values,['uTtAr PrAdEsH','lUcKnOw','wHeAt','upag','2024-2025','2024-2025',101,0]);
 }finally{pool.query=originalQuery;}
});
