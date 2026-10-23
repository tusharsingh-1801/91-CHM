/** Link only pending trained-model, calendar and WorldCereal references to existing fields.
 * No training, sample verification or other provider acquisition is performed.
 */
import 'dotenv/config';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pool} from '../backend/api/db/pool.ts';
import {extractReference,persistReference} from '../backend/api/services/referenceDatasets.ts';
const mode=process.argv[2]??'all';
if(!['all','--metadata-only','--worldcereal-only'].includes(mode))throw Error('Use --metadata-only, --worldcereal-only, or no argument');
const providers=mode==='--metadata-only'?['cropharvest','fao-calendar']:mode==='--worldcereal-only'?['worldcereal']:['cropharvest','fao-calendar','worldcereal'];
const report={created_at:new Date().toISOString(),mode,results:[]};
try{
 const template=(await pool.query(`select * from reference_dataset_runs where provider='cropharvest' and payload->>'training_status'='trained_heldout_evaluated' order by created_at desc limit 1`)).rows[0];
 if(!template)throw Error('Publish the existing trained CropHarvest evaluation first');
 const fields=(await pool.query(`select id,boundary_version,ST_AsGeoJSON(boundary_geom)::jsonb as geometry from fields where boundary_geom is not null order by id`)).rows;
 const latest=(await pool.query(`select distinct on(field_id,provider) r.* from reference_dataset_runs r join fields f on f.id=r.field_id and f.boundary_version=r.boundary_version where provider in ('cropharvest','fao-calendar','worldcereal') order by field_id,provider,r.created_at desc,r.id desc`)).rows;
 for(const field of fields){
  for(const provider of providers){
   const previous=latest.find(row=>row.field_id===field.id&&row.provider===provider);
   const current=provider==='cropharvest'?previous?.payload?.training_status==='trained_heldout_evaluated'&&previous?.payload?.model_sha256===template.payload.model_sha256:
    provider==='fao-calendar'?Array.isArray(previous?.payload?.recommendations)&&previous.payload.recommendations.length>0:previous?.status==='integrated';
   if(current){report.results.push({field_id:field.id,provider,status:'existing_reference_preserved'});continue;}
   try{
    const result=provider==='cropharvest'?{provider,status:'downloaded',source:template.source,version:template.version,source_url:template.source_url,license:template.license,fetched_at:new Date().toISOString(),payload:{...template.payload,scope:'global_research_model_reference',field_inference:false,note:'Global CropHarvest benchmark and held-out model evaluation; no inference or measurement for this field is claimed.'}}:
     (await extractReference(field,{providers:[provider],start:'2021-01-01',end:'2021-12-31'}))[0];
    if(previous?.status===result.status&&previous?.payload?.availability&&previous.payload.availability===result.payload?.availability){report.results.push({field_id:field.id,provider,status:'existing_unavailable_status_preserved'});continue;}
    const saved=await persistReference(field,result);report.results.push({field_id:field.id,provider,status:saved.status,persisted:saved.persisted,mode:saved.payload?.mode,scope:saved.payload?.scope});
   }catch(error){report.results.push({field_id:field.id,provider,status:'failed',error:error.message});process.exitCode=1;}
  }
 }
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
 await mkdir('.local/datasets/reference',{recursive:true});await writeFile('.local/datasets/reference/pending-integration-'+mode.replace('--','')+'-report.json',JSON.stringify(report,null,2)+'\n');
 const counts={};for(const row of report.results){const key=row.provider+':'+row.status;counts[key]=(counts[key]??0)+1;}console.log(JSON.stringify({counts,error:report.error,report:'.local/datasets/reference/pending-integration-'+mode.replace('--','')+'-report.json'},null,2));
 await pool.end();
}
