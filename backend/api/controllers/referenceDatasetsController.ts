import type {Request,Response} from 'express';
import {pool} from '../db/pool.ts';
import {extractReference,persistReference,referenceOptions,referencePage} from '../services/referenceDatasets.ts';
export async function listReferenceDatasets(request:Request,response:Response){
 let page:ReturnType<typeof referencePage>;
 try{page=referencePage(request.query);}catch(error){response.status(400).json({error:(error as Error).message});return;}
 const result=await pool.query(`select r.* from reference_dataset_runs r join fields f on f.id=r.field_id
 where r.field_id=$1 and r.boundary_version=f.boundary_version and ($2::text is null or r.provider=$2)
 order by r.created_at desc,r.id desc limit $3 offset $4`,[request.params.fieldId,page.provider,page.limit+1,page.offset]);
 response.json({items:result.rows.slice(0,page.limit),hasMore:result.rows.length>page.limit,offset:page.offset,limit:page.limit});
}

export async function syncReferenceDatasets(request:Request,response:Response){
 let options:ReturnType<typeof referenceOptions>;
 try{
  options=referenceOptions(request.body??{});
  if(options.providers.some(provider=>!['worldcover','chirps','soilgrids','worldcereal'].includes(provider))||request.body?.fao_calendar_csv!==undefined){response.status(400).json({error:'Only field-scoped public map, rainfall and soil providers can be refreshed here.'});return;}
 }catch(error){response.status(400).json({error:(error as Error).message});return;}
 try{
  const result=await pool.query<{id:string;boundary_version:number;geometry:Record<string,unknown>}>(`select id,boundary_version,ST_AsGeoJSON(boundary_geom)::jsonb as geometry from fields where id=$1`,[request.params.fieldId]);
  const field=result.rows[0];
  if(!field){response.status(404).json({error:'Field not found'});return;}
  const extracted=await extractReference({geometry:field.geometry},options);
  const items=[];
  for(const item of extracted)items.push(await persistReference({id:field.id,boundary_version:field.boundary_version},item));
  response.json({items});
 }catch(error){
  console.error('POST /api/fields/:fieldId/datasets/sync failed:',error);
  response.status(503).json({error:'Reference data could not be refreshed. Check the connection and retry.'});
 }
}
