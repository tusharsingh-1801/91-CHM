import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pool} from '../db/pool.ts';
export const referenceProviders=['worldcover','chirps','soilgrids','worldcereal','cropharvest','fao-calendar'] as const;
export type ReferenceProvider=typeof referenceProviders[number];
export type ReferenceResult={provider:ReferenceProvider;status:'downloaded'|'integrated'|'blocked'|'manual'|'failed'|'not_configured';source:string;version:string;source_url:string;license:string;fetched_at:string;payload?:Record<string,unknown>;error?:string;attempted_url?:string;http_status?:number|null;availability?:string};
export type ReferenceOptions={providers:ReferenceProvider[];start:string;end:string;fao_calendar_csv?:string};
export function referenceOptions(input:Record<string,unknown>):ReferenceOptions{
 const providers=input.providers??[...referenceProviders];
 if(!Array.isArray(providers)||!providers.length||providers.length>6||new Set(providers).size!==providers.length||providers.some(p=>!referenceProviders.includes(p)))throw new Error('Select 1–6 distinct known providers');
 const end=input.end??new Date(Date.now()-30*86400000).toISOString().slice(0,10);
 const start=input.start??end;
 for(const value of [start,end])if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('Use valid YYYY-MM-DD dates');
 const days=(Date.parse(end as string)-Date.parse(start as string))/86400000;
 if(days<0||days>365||(start as string)<'1981-01-01'||Date.parse(end as string)>Date.now())throw new Error('Use a past interval of at most 366 days from 1981');
 const calendarCsv=input.fao_calendar_csv;
 if(calendarCsv!==undefined&&(typeof calendarCsv!=='string'||!calendarCsv.trim()||calendarCsv.length>1000))throw new Error('FAO calendar CSV path must be a non-empty local path');
 return {providers:providers as ReferenceProvider[],start:start as string,end:end as string,...(calendarCsv===undefined?{}:{fao_calendar_csv:calendarCsv as string})};
}
export function referencePage(input:Record<string,unknown>){
 const limit=input.limit??'20',offset=input.offset??'0';
 if(!/^\d+$/.test(String(limit))||!/^\d+$/.test(String(offset))||Number(limit)<1||Number(limit)>100||Number(offset)>10000)throw new Error('limit must be 1–100 and offset 0–10000');
 if(input.provider!==undefined&&!referenceProviders.includes(input.provider as ReferenceProvider))throw new Error('Unknown provider');
 return {limit:Number(limit),offset:Number(offset),provider:input.provider??null};
}
const root=fileURLToPath(new URL('../../../',import.meta.url));
export function extractReference(field:Record<string,unknown>,options:ReferenceOptions):Promise<ReferenceResult[]>{
 return new Promise((resolve,reject)=>{
  const python=process.env.REFERENCE_PYTHON||(existsSync(root+'.venv/bin/python')?root+'.venv/bin/python':'python3');
  const child=spawn(python,[root+'backend/engine/reference_data.py'],{cwd:root,stdio:['pipe','pipe','pipe']});
  let output='',error='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Reference extraction exceeded 15 minute bound'));},900000);
  child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString();if(output.length>8*1024*1024){child.kill();reject(new Error('Reference response exceeds size bound'));}});
  child.stderr.on('data',(chunk:Buffer)=>{error=(error+chunk.toString()).slice(-4000);});
  child.on('error',err=>{clearTimeout(timer);reject(err);});
  child.on('close',code=>{clearTimeout(timer);if(code!==0){reject(new Error(`Python extraction failed (${code}): ${error}`));return;}try{resolve(JSON.parse(output) as ReferenceResult[]);}catch{reject(new Error('Invalid reference engine response'));}});
  child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify({field,options}));
 });
}
export async function persistReference(field:{id:string;boundary_version:number},result:ReferenceResult){
 if(result.provider==='fao-calendar'&&result.payload?.is_demo){
  const official=await pool.query(`select id from reference_dataset_runs where field_id=$1 and boundary_version=$2 and provider='fao-calendar'
   and coalesce(payload->>'is_demo','false')!='true' and jsonb_typeof(payload->'recommendations')='array'
   and jsonb_array_length(payload->'recommendations')>0 limit 1`,[field.id,field.boundary_version]);
  if(official.rowCount)return {...result,persisted:false,retained_existing_reference:true};
 }

 // A failed attempt is appended, so previously successful snapshots remain auditable.
 // A boundary edit during extraction must not attach results to a new boundary.
 const status=result.status==='downloaded'&&result.provider!=='cropharvest'?'integrated':result.status;
 const saved=await pool.query(`insert into reference_dataset_runs(field_id,boundary_version,provider,status,source,version,source_url,license,period,coverage_percent,payload,error,fetched_at)
 select id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13 from fields where id=$1 and boundary_version=$2 returning id`,
 [field.id,field.boundary_version,result.provider,status,result.source,result.version,result.source_url,result.license,result.payload?.period??'',result.payload?.coverage_percent??null,JSON.stringify(result.payload??{}),result.error?JSON.stringify({message:result.error,url:result.attempted_url,http_status:result.http_status??null,availability:result.availability}):null,result.fetched_at]);
 if(!saved.rowCount)throw new Error('Field removed or boundary changed during reference extraction');
 return {...result,status,persisted:true};
}
