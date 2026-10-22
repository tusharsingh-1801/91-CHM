import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';

/** Read-only reference data: never substitute these dates for a farmer's records. */
export async function getFieldFaoCalendar(request: Request, response: Response) {
  const fieldId = request.params.fieldId;
  try {
    const exists = await pool.query(
      "select to_regclass('public.fao_crop_calendar_references') as table_name"
    );
    if (!exists.rows[0]?.table_name) {
      await demoFallback(fieldId,response);return;
    }
    const result = await pool.query(
      `SELECT country, region, crop,
              planting_start_month AS "plantingStartMonth",
              planting_end_month AS "plantingEndMonth",
              harvest_start_month AS "harvestStartMonth",
              harvest_end_month AS "harvestEndMonth",
              source_url AS "sourceUrl", source_title AS "sourceTitle",
              license, permission_note AS "permissionNote",
              reviewed_on AS "reviewedOn"
         FROM fao_crop_calendar_references
        WHERE field_id = $1 ORDER BY crop, region LIMIT 100`,
      [fieldId]
    );
    if(!result.rows.length){await demoFallback(fieldId,response);return;}
    response.json({ status: 'available',mode:'official_reference',isDemo:false,
      source: 'reviewed_reference', fieldId, records: result.rows,
      disclaimer: 'Historical regional reference only; not a verified planting date or a replacement for farmer records.' });
  } catch {
    response.status(503).json({ error: 'Crop calendar reference temporarily unavailable' });
  }
}

/** A stored, explicitly synthetic fallback is never returned as an official calendar. */
async function demoFallback(fieldId:unknown,response:Response){
 const result=await pool.query(`select r.payload from reference_dataset_runs r join fields f on f.id=r.field_id
  where r.field_id=$1 and r.boundary_version=f.boundary_version and r.provider='fao-calendar'
  and r.payload->>'is_demo'='true' order by r.created_at desc limit 1`,[fieldId]);
 const payload=result.rows[0]?.payload;
 const records=Array.isArray(payload?.recommendations)?payload.recommendations.map((row:Record<string,unknown>)=>({
  country:'India',region:row.region,crop:row.crop,season:row.season,plantingStartMonth:row.planting_start_month,plantingEndMonth:row.planting_end_month,
  harvestStartMonth:row.harvest_start_month,harvestEndMonth:row.harvest_end_month,sourceUrl:row.source_url,sourceTitle:row.source_title,
  license:row.license,reviewedOn:row.accessed_on,isDemo:true,
 })):[];
 response.json({status:records.length?'demo_fallback':'not_imported',mode:records.length?'demo':'unavailable',isDemo:records.length>0,
  source:records.length?'terrascope_demo':'reviewed_reference',fieldId,records,
  officialDataStatus:payload?.official_data_status??'No reviewed calendar imported',
  disclaimer:records.length?'DEMO ONLY — illustrative Indian calendar, not FAO records or actual field dates.':'No reviewed crop calendar has been imported.'});
}
