import 'dotenv/config';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pool} from '../backend/api/db/pool.ts';
const metrics=JSON.parse(await readFile('.local/datasets/reference/cropharvest/held-out-evaluation.json','utf8'));
const manifest=JSON.parse(await readFile('.local/datasets/reference/cropharvest/training-manifest.json','utf8'));
const modelPath='backend/engine/models/cropharvest-rf.joblib';
const digest=createHash('sha256').update(await readFile(modelPath)).digest('hex');
if(digest!==metrics.model_sha256)throw Error('Model checksum differs from evaluation');
for(const name of ['accuracy','balanced_accuracy','f1','precision','recall','roc_auc'])if(!Number.isFinite(metrics[name])||metrics[name]<0||metrics[name]>1)throw Error('Invalid measured metric');
const {train_ids,test_ids,...report}=metrics;
Object.assign(report,{model_file:modelPath,input_sample_count:manifest.input_sample_count,excluded_sample_count:manifest.excluded_samples.length,exclusions:manifest.excluded_samples.reduce((out,row)=>(out[row.reason]=(out[row.reason]??0)+1,out),{}),split_policy:manifest.split_policy,evaluated_on:'2026-10-23',limitations:['Source-held-out crop/non-crop research benchmark; not crop-health, disease, yield or farm inference.','Test data was not used for tuning. Official test rows never enter training.','Record-level license and constituent attribution are recorded; feature data is not redistributed.']});
await mkdir('docs/reports',{recursive:true});
await writeFile('docs/reports/cropharvest-heldout.json',JSON.stringify(report,null,2)+'\n');
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const rows=(await client.query(`select distinct on(r.field_id) r.* from reference_dataset_runs r join fields f on f.id=r.field_id and f.boundary_version=r.boundary_version where r.provider='cropharvest' order by r.field_id,r.created_at desc,r.id desc`)).rows;
 if(!rows.length)throw Error('No current-boundary CropHarvest acquisition record exists');
 for(const row of rows){
  const payload={...row.payload,training_status:'trained_heldout_evaluated',model_sha256:digest,training_metrics:report};
  await client.query(`insert into reference_dataset_runs(field_id,boundary_version,provider,status,source,version,source_url,license,period,coverage_percent,payload,error,fetched_at)
   select id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,now() from fields where id=$1 and boundary_version=$2`,[row.field_id,row.boundary_version,row.provider,row.status,row.source,row.version,row.source_url,row.license,row.period,row.coverage_percent,JSON.stringify(payload)]);
 }
 await client.query('COMMIT');console.log(JSON.stringify({published_fields:rows.length,report:'docs/reports/cropharvest-heldout.json',model:modelPath,accuracy:report.accuracy,balanced_accuracy:report.balanced_accuracy,f1:report.f1}));
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
