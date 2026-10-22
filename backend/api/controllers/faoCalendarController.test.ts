import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Request,Response} from 'express';
import {pool} from '../db/pool.ts';
import {getFieldFaoCalendar} from './faoCalendarController.ts';
async function invoke(){let value:any;let status=200;await getFieldFaoCalendar({params:{fieldId:'field'}} as unknown as Request,{json(body:unknown){value=body;},status(code:number){status=code;return this;}} as unknown as Response);return {value,status};}
test('calendar API labels stored demo data and filters boundary revision',async()=>{
 const original=pool.query;
 try{
  pool.query=(async(sql:string)=>{
   if(sql.includes('to_regclass'))return {rows:[{table_name:null}]};
   assert.match(sql,/r.boundary_version=f.boundary_version/);
   return {rows:[{payload:{official_data_status:'India unavailable',recommendations:[{crop:'Rice',planting_start_month:6,planting_end_month:7,harvest_start_month:10,harvest_end_month:11}]}}]};
  }) as typeof pool.query;
  const {value,status}=await invoke();assert.equal(status,200);assert.equal(value.mode,'demo');assert.equal(value.isDemo,true);assert.equal(value.records[0].plantingStartMonth,6);assert.match(value.disclaimer,/not FAO/);
 }finally{pool.query=original;}
});
test('reviewed records take priority and missing fallback is unavailable',async()=>{
 const original=pool.query;
 try{
  pool.query=(async(sql:string)=>({rows:sql.includes('to_regclass')?[{table_name:'fao_crop_calendar_references'}]:[{crop:'Wheat'}]})) as typeof pool.query;
  const real=await invoke();assert.equal(real.value.mode,'official_reference');assert.equal(real.value.isDemo,false);
  pool.query=(async(sql:string)=>({rows:sql.includes('to_regclass')?[{table_name:null}]:[]})) as typeof pool.query;
  assert.equal((await invoke()).value.status,'not_imported');
 }finally{pool.query=original;}
});
