import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Request,Response} from 'express';
import {pool} from '../db/pool.ts';
import {getFieldFaoCalendar} from './faoCalendarController.ts';
async function invoke(){let value:any;let status=200;await getFieldFaoCalendar({params:{fieldId:'field'}} as unknown as Request,{json(body:unknown){value=body;},status(code:number){status=code;return this;}} as unknown as Response);return {value,status};}
test('calendar API does not substitute synthetic data when the reference table is absent',async()=>{
 const original=pool.query;
 try{
  pool.query=(async(sql:string)=>{
   if(sql.includes('to_regclass'))return {rows:[{table_name:null}]};
   throw new Error('No fallback query should be performed');
  }) as typeof pool.query;
  const {value,status}=await invoke();assert.equal(status,200);assert.equal(value.status,'not_imported');assert.equal(value.mode,'unavailable');assert.equal(value.isDemo,false);assert.deepEqual(value.records,[]);
 }finally{pool.query=original;}
});
test('reviewed records take priority and empty reference tables remain unavailable',async()=>{
 const original=pool.query;
 try{
  pool.query=(async(sql:string)=>({rows:sql.includes('to_regclass')?[{table_name:'fao_crop_calendar_references'}]:[{crop:'Wheat'}]})) as typeof pool.query;
  const real=await invoke();assert.equal(real.value.mode,'official_reference');assert.equal(real.value.isDemo,false);
  pool.query=(async(sql:string)=>({rows:sql.includes('to_regclass')?[{table_name:'fao_crop_calendar_references'}]:[]})) as typeof pool.query;
  assert.equal((await invoke()).value.status,'not_imported');
 }finally{pool.query=original;}
});
