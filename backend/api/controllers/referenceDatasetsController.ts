import type {Request,Response} from 'express';
import {pool} from '../db/pool.ts';
import {referencePage} from '../services/referenceDatasets.ts';
export async function listReferenceDatasets(request:Request,response:Response){
 let page:ReturnType<typeof referencePage>;
 try{page=referencePage(request.query);}catch(error){response.status(400).json({error:(error as Error).message});return;}
 const result=await pool.query(`select r.* from reference_dataset_runs r join fields f on f.id=r.field_id
 where r.field_id=$1 and r.boundary_version=f.boundary_version and ($2::text is null or r.provider=$2)
 order by r.created_at desc,r.id desc limit $3 offset $4`,[request.params.fieldId,page.provider,page.limit+1,page.offset]);
 response.json({items:result.rows.slice(0,page.limit),hasMore:result.rows.length>page.limit,offset:page.offset,limit:page.limit});
}
