import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import {pool} from '../backend/api/db/pool.ts';
import {extractReference,persistReference,referenceOptions,referenceProviders,type ReferenceResult} from '../backend/api/services/referenceDatasets.ts';
const args=process.argv.slice(2);
const report:{created_at:string;results:unknown[];error?:string}={created_at:new Date().toISOString(),results:[]};
try{
 const allowed=new Set(['--fields','--providers','--start','--end','--fao-calendar-csv']);
 const values:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith('--')||values[args[i].slice(2)]!==undefined)throw new Error('Usage: npm run data:sync:references -- --fields UUID[,UUID] [--providers worldcover,chirps] [--start YYYY-MM-DD --end YYYY-MM-DD] [--fao-calendar-csv PATH]');values[args[i].slice(2)]=args[i+1];}
 if((values.start===undefined)!==(values.end===undefined))throw new Error('Provide both --start and --end');
 const ids=values.fields?.split(',')??[];
 if(!ids.length||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>! /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))throw new Error('Explicit distinct --fields UUID[,UUID] required; maximum 50 fields');
 const options=referenceOptions({start:values.start,end:values.end,providers:values.providers?.split(','),fao_calendar_csv:values['fao-calendar-csv']});
 let fields:{id:string;boundary_version:number;geometry:unknown}[];
 try{fields=(await pool.query('select id,boundary_version,ST_AsGeoJSON(boundary_geom)::jsonb as geometry from fields where id=any($1::uuid[]) order by id',[ids])).rows;}
 catch(error){for(const id of ids)for(const provider of options.providers)report.results.push({field_id:id,provider,status:'blocked',persisted:false,error:`PostgreSQL: ${(error as Error).message}`});throw error;}
 for(const id of ids)if(!fields.some(f=>f.id===id)){for(const provider of options.providers)report.results.push({field_id:id,provider,status:'not_configured',persisted:false,error:'Selected field not found'});process.exitCode=1;}
 for(const field of fields){
  // One subprocess per provider: interpreter/process failure cannot stop other providers.
  for(const provider of options.providers){
   try{
    const [result]=await extractReference(field,{...options,providers:[provider]});
    try{report.results.push({field_id:field.id,...await persistReference(field,result)});if(result.status==='blocked'||result.status==='failed')process.exitCode=1;}
    catch(error){report.results.push({field_id:field.id,...result,status:result.status==='downloaded'?'downloaded':result.status,persisted:false,persistence_error:(error as Error).message});process.exitCode=1;}
   }catch(error){report.results.push({field_id:field.id,provider,status:'failed',persisted:false,error:(error as Error).message});process.exitCode=1;}
  }
 }
}catch(error){report.error=(error as Error).message;process.exitCode=1;}
finally{
 if(!report.results.length)for(const provider of referenceProviders)report.results.push({provider,status:'not_configured',persisted:false,error:report.error});
 await mkdir('.local/datasets/reference',{recursive:true});
 await writeFile('.local/datasets/reference/sync-report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 console.log('Report: .local/datasets/reference/sync-report.json');
 await pool.end();
}
