import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {pool} from '../db/pool.ts';
import {actor} from './auth.ts';
import {processLatest} from './satellite.ts';
import {ingestEarthEngineScenes,ingestWeather} from '../controllers/fieldsController.ts';
export interface Job{id:string;field_id:string;owner_id:string|null;boundary_version:number;kind:'satellite'|'weather';status:'queued'|'running'|'succeeded'|'failed';attempts:number;max_attempts:number;lease_token:string;progress:string;result:Record<string,unknown>|null;error:string|null}
const publicColumns='id,field_id,boundary_version,kind,status,progress,result,error,created_at,finished_at';
async function controllerWork(handler:typeof ingestWeather,fieldId:string){
 let status=200;let payload:Record<string,unknown>={};
 await handler({params:{fieldId},query:{},body:{}} as unknown as Request,{status(code:number){status=code;return this;},json(value:Record<string,unknown>){payload=value;}} as unknown as Response);
 if(status>=400)throw new Error(String(payload.error||'Provider unavailable'));return payload;
}
export async function enqueue(request:Request,response:Response){
 const kind=request.body?.kind??'satellite';if(!['satellite','weather'].includes(kind)){response.status(400).json({error:'Choose satellite or weather processing'});return;}
 const id=String(request.params.fieldId);
 const client=await pool.connect();
 try{
  await client.query('begin');
  const field=(await client.query('select boundary_version,owner_id from fields where id=$1 for update',[id])).rows[0];if(!field){await client.query('rollback');response.status(404).json({error:'Field not found'});return;}
  await client.query(`update ingestion_jobs set status='failed',lease_token=null,error='Field boundary changed',progress='Start a new image check for the edited field',finished_at=now()
   where field_id=$1 and boundary_version<>$2 and status in ('queued','running')`,[id,field.boundary_version]);
  const job=await client.query(`insert into ingestion_jobs(field_id,owner_id,boundary_version,kind) values($1,$2,$3,$4)
   on conflict(field_id,kind) where status in ('queued','running') do update set field_id=excluded.field_id returning ${publicColumns}`,[id,actor(response)?.id??field.owner_id,field.boundary_version,kind]);
  await client.query('commit');
  response.status(202).json(job.rows[0]);
 }catch {await client.query('rollback');console.error('Database operation failed');response.status(503).json({error:'Processing could not be queued. Your field remains saved.'});}finally{client.release();}
}
export async function listJobs(request:Request,response:Response){response.json((await pool.query(`select ${publicColumns} from ingestion_jobs where field_id=$1 order by created_at desc limit 20`,[request.params.fieldId])).rows);}
export async function retryJob(request:Request,response:Response){
 const result=await pool.query(`update ingestion_jobs set status='queued',attempts=0,available_at=now(),error=null,progress='Queued for retry',finished_at=null
  where id=$1 and field_id=$2 and status='failed' and boundary_version=(select boundary_version from fields where id=$2)
  and not exists(select 1 from ingestion_jobs other where other.field_id=$2 and other.kind=ingestion_jobs.kind and other.status in ('queued','running')) returning ${publicColumns}`,[request.params.jobId,request.params.fieldId]);
 if(!result.rowCount){response.status(409).json({error:'This job cannot be retried. A job is active or the boundary changed; queue a new analysis.'});return;}response.json(result.rows[0]);
}
export async function runOne(execute?:(job:Job)=>Promise<Record<string,unknown>>):Promise<boolean>{
 // Recovery waits longer than a scene-processing lease, so a killed worker cannot leave work stuck forever.
 await pool.query(`update ingestion_jobs set status=case when attempts>=max_attempts then 'failed' else 'queued' end,
  available_at=now(),lease_token=null,error='Worker lease expired; recovered',progress=case when attempts>=max_attempts then 'Image check failed; please retry' else 'Recovered after worker restart' end,
  finished_at=case when attempts>=max_attempts then now() else null end
  where status='running' and heartbeat_at<now()-interval '6 minutes'`);
 const token=randomUUID();
 const claim=await pool.query<Job>(`with candidate as(select id from ingestion_jobs where status='queued' and available_at<=now() order by available_at,created_at for update skip locked limit 1)
  update ingestion_jobs j set status='running',attempts=attempts+1,heartbeat_at=now(),lease_token=$1,progress='Checking provider and field boundary' from candidate where j.id=candidate.id returning j.*`,[token]);
 const job=claim.rows[0];if(!job)return false;
 const heartbeat=setInterval(()=>{void pool.query("update ingestion_jobs set heartbeat_at=now() where id=$1 and lease_token=$2 and status='running'",[job.id,token]).catch(()=>console.error('Job heartbeat'));},20000);heartbeat.unref();
 try{
  const field=(await pool.query('select boundary_version from fields where id=$1',[job.field_id])).rows[0];
  if(!field||field.boundary_version!==job.boundary_version){await pool.query("update ingestion_jobs set status='failed',lease_token=null,error='Field boundary changed',progress='Start a new image check for the edited field',finished_at=now() where id=$1 and lease_token=$2",[job.id,token]);return true;}
  let result:Record<string,unknown>;
  if(execute)result=await execute(job);
  else if(job.kind==='weather')result=await controllerWork(ingestWeather,job.field_id);
  else{
   await controllerWork(ingestEarthEngineScenes,job.field_id);
   await pool.query("update ingestion_jobs set progress='Processing newest candidates; checking field coverage' where id=$1 and lease_token=$2",[job.id,token]);
   const processed=await processLatest(job.field_id);result=processed;
   if(!processed.accepted&&processed.attempts.some(attempt=>attempt.status==='failed'))throw new Error('Processing failed. The saved field and last accepted evidence are unchanged.');
  }
  await pool.query(`update ingestion_jobs set status='succeeded',result=$3,progress=$4,error=null,finished_at=now(),lease_token=null where id=$1 and lease_token=$2 and status='running'`,[job.id,token,JSON.stringify(result),job.kind==='weather'?'Historical weather synced':result.accepted?'Usable observation accepted':'No usable image available']);
 }catch(error){
  const message=error instanceof Error?error.message:'Processing failed';
  await pool.query(`update ingestion_jobs set status=case when attempts>=max_attempts then 'failed' else 'queued' end,error=$3,progress=case when attempts>=max_attempts then 'Image check failed; please retry' else 'Retry scheduled' end,available_at=now()+($4 * interval '1 second'),lease_token=null,finished_at=case when attempts>=max_attempts then now() else null end where id=$1 and lease_token=$2 and status='running'`,[job.id,token,message,Math.min(60,5*2**job.attempts)]);
 }finally{clearInterval(heartbeat);}return true;
}
export function startWorkers(){let active=0;let stopped=false;const limit=Math.min(4,Math.max(1,Number(process.env.JOB_CONCURRENCY)||2));
 const timer=setInterval(()=>{if(stopped||active>=limit)return;active++;void runOne().catch(()=>console.error('Worker')).finally(()=>active--);},1500);timer.unref();
 return async()=>{stopped=true;clearInterval(timer);};
}
