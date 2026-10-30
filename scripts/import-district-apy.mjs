import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import pg from 'pg';
import {loadEnvironment} from './environment.mjs';

loadEnvironment();
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const root=process.cwd();
const python=process.env.PYTHON_BIN||(existsSync('.venv/Scripts/python.exe')?'.venv/Scripts/python.exe':existsSync('.venv/bin/python')?'.venv/bin/python':'python');
const sources=[
 {id:'des',file:'.local/datasets/yield/raw/crop-wise-area-production-yield.csv'},
 {id:'upag',file:'.local/datasets/yield/raw/cropwise-area-production-yield-upag.csv'},
];
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const columns=['source_id','source_row_id','crop_year','state_name','state_code','district_name','district_code','season','crop_name','crop_code','crop_category','area_value','area_unit','production_value','production_unit','yield_value','yield_unit','source_url','license','source_record'];
const types=['text','text','text','text','text','text','text','text','text','text','text','numeric','text','numeric','text','numeric','text','text','text','jsonb'];
const aliases=columns.map((name,index)=>`${name} ${types[index]}`).join(',');
const query=`insert into district_crop_apy(${columns.join(',')}) select ${columns.map(name=>`x.${name}`).join(',')} from jsonb_to_recordset($1::jsonb) as x(${aliases}) on conflict(source_id,source_row_id) do update set ${columns.slice(2).map(name=>`${name}=excluded.${name}`).join(',')}, imported_at=now() where district_crop_apy.source_record is distinct from excluded.source_record`;

async function importSource(source){
 const file=resolve(root,source.file);
 if(!existsSync(file))throw new Error(`Missing ${file}; acquire APY data first.`);
 const child=spawn(python,['scripts/stream-district-apy.py',source.id,file],{cwd:root,stdio:['ignore','pipe','pipe']});
 const childClosed=new Promise((resolveCode,reject)=>{child.once('error',reject);child.once('close',resolveCode);});
 const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
 let batch=[],rows=0,stderr='';
 child.stderr.setEncoding('utf8').on('data',chunk=>{stderr+=chunk;});
 for await(const line of lines){
  if(!line)continue;
  batch.push(JSON.parse(line));
  if(batch.length>=400){await client.query(query,[JSON.stringify(batch)]);rows+=batch.length;batch=[];if(rows%20000===0)console.log(`${source.id}: processed ${rows} rows`);}
 }
 if(batch.length){await client.query(query,[JSON.stringify(batch)]);rows+=batch.length;}
 const code=await childClosed;
 if(code!==0)throw new Error(`Normalizer failed for ${source.id}: ${stderr}`);
 console.log(`${source.id}: synchronized ${rows} district APY rows`);
 return {source:source.id,rows};
}

try{
 await client.connect();
 const results=[];
 for(const source of sources)results.push(await importSource(source));
 console.log(JSON.stringify({results},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await client.end().catch(()=>{});}
