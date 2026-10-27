import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';

/** Read-only reference data: never substitute these dates for a farmer's records. */
export async function getFieldFaoCalendar(request: Request, response: Response) {
  const fieldParam = request.params.fieldId;
  const fieldId = Array.isArray(fieldParam) ? fieldParam[0] : fieldParam;
  if (!fieldId) {
    response.status(400).json({ error: 'Field ID is required' });
    return;
  }
  try {
    const exists = await pool.query(
      "select to_regclass('public.fao_crop_calendar_references') as table_name"
    );
    if (!exists.rows[0]?.table_name) {
      response.json(unavailableResponse(fieldId));return;
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
    if(!result.rows.length){response.json(unavailableResponse(fieldId));return;}
    response.json({ status: 'available',mode:'official_reference',isDemo:false,
      source: 'reviewed_reference', fieldId, records: result.rows,
      disclaimer: 'Historical regional reference only; not a verified planting date or a replacement for farmer records.' });
  } catch {
    response.status(503).json({ error: 'Crop calendar reference temporarily unavailable' });
  }
}

function unavailableResponse(fieldId: string) {
  return {
    status: 'not_imported',
    mode: 'unavailable',
    isDemo: false,
    source: 'reviewed_reference',
    fieldId,
    records: [],
    officialDataStatus: 'No reviewed calendar imported',
    disclaimer: 'No reviewed crop calendar has been imported.',
  };
}
