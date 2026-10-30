import type {Request,Response} from 'express';
import {pool} from '../db/pool.ts';

const clean=(value:unknown,max=120)=>typeof value==='string'?value.trim().slice(0,max):'';
const yearPattern=/^\d{4}-\d{4}$/;

export async function getDistrictApyFilters(request:Request,response:Response){
 const state=clean(request.query.state);
 const source=clean(request.query.source,16).toLowerCase();
 if(source&&!['des','upag'].includes(source)){response.status(400).json({error:'source must be des or upag'});return;}
 const sourceClause=source||'';
 const [states,districts,crops,years,counts]=await Promise.all([
  pool.query<{state_name:string}>("select distinct state_name from district_crop_apy where ($1::text = '' or lower(source_id)=lower($1)) order by state_name",[sourceClause]),
  state?pool.query<{district_name:string}>("select distinct district_name from district_crop_apy where lower(state_name)=lower($1) and ($2::text = '' or lower(source_id)=lower($2)) order by district_name",[state,sourceClause]):Promise.resolve({rows:[]} as {rows:{district_name:string}[]}),
  pool.query<{crop_name:string}>("select distinct crop_name from district_crop_apy where ($1::text = '' or lower(source_id)=lower($1)) order by crop_name",[sourceClause]),
  pool.query<{crop_year:string}>("select distinct crop_year from district_crop_apy where ($1::text = '' or lower(source_id)=lower($1)) order by crop_year desc",[sourceClause]),
  pool.query<{source_id:string;row_count:string;latest_year:string}>('select source_id,count(*)::text as row_count,max(crop_year) as latest_year from district_crop_apy group by source_id order by source_id'),
 ]);
 response.json({states:states.rows.map(row=>row.state_name),districts:districts.rows.map(row=>row.district_name),crops:crops.rows.map(row=>row.crop_name),years:years.rows.map(row=>row.crop_year),sources:counts.rows});
}

export async function listDistrictApy(request:Request,response:Response){
 const state=clean(request.query.state),district=clean(request.query.district),crop=clean(request.query.crop),source=clean(request.query.source,16).toLowerCase();
 const yearFrom=clean(request.query.year_from,12),yearTo=clean(request.query.year_to,12);
 if(source&&!['des','upag'].includes(source)){response.status(400).json({error:'source must be des or upag'});return;}
 if((yearFrom&&!yearPattern.test(yearFrom))||(yearTo&&!yearPattern.test(yearTo))){response.status(400).json({error:'Years must use YYYY-YYYY format'});return;}
 const number=(value:unknown,fallback:number)=>{const parsed=Number(value);return Number.isInteger(parsed)&&parsed>=0?parsed:fallback;};
 const limit=Math.min(number(request.query.limit,100),200),offset=number(request.query.offset,0);
 const result=await pool.query(`select source_id,crop_year,state_name,district_name,district_code,season,crop_name,crop_code,crop_category,area_value,area_unit,production_value,production_unit,yield_value,yield_unit,source_url,license
  from district_crop_apy
  where ($1::text='' or lower(state_name)=lower($1)) and ($2::text='' or lower(district_name)=lower($2)) and ($3::text='' or lower(crop_name)=lower($3))
   and ($4::text='' or lower(source_id)=lower($4)) and ($5::text='' or crop_year >= $5) and ($6::text='' or crop_year <= $6)
  order by crop_year desc,state_name,district_name,crop_name,source_id limit $7 offset $8`,[state,district,crop,source,yearFrom,yearTo,limit+1,offset]);
 response.json({items:result.rows.slice(0,limit),hasMore:result.rows.length>limit,offset,limit});
}
