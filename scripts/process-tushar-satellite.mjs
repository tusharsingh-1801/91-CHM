#!/usr/bin/env node
// Run the existing real Sentinel-2 workflow for Tushar's fields and export evidence reports.
// Example: node scripts/process-tushar-satellite.mjs
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.CHM_API_ORIGIN||'http://localhost:3001';
const credentials=JSON.parse(await readFile('.local/tushar-test-account-7586e28d.json','utf8'));
async function req(url,method='GET',cookie='',body,timeout=180000){
 const response=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(method+' '+url+' HTTP '+response.status+': '+JSON.stringify(data));
 return {response,data};
}
const login=await req('/api/auth/login','POST','',credentials);
const cookie=(login.response.headers.get('set-cookie')||'').split(';')[0];
if(!cookie.startsWith('chm_session='))throw Error('Login cookie missing');
const {data:fields}=await req('/api/fields','GET',cookie);
if(!Array.isArray(fields)||!fields.length)throw Error('No fields in Tushar account. Check DB/session before processing.');
const reports=[];
for(const field of fields){
 const id=encodeURIComponent(field.id);
 const result={fieldId:field.id,name:field.name,crop:field.crop,source:'Copernicus Sentinel-2 L2A / Earth Search',ingestion:null,processing:null,weather:[],ndvi:[],errors:[]};
 console.log('\nFIELD',field.name,field.id);
 try{const existing=(await req('/api/fields/'+id+'/scenes','GET',cookie)).data;if(Array.isArray(existing)&&existing.length){result.ingestion={reused:existing.length};console.log('Reusing existing scenes',existing.length)}else{result.ingestion=(await req('/api/fields/'+id+'/ingest/sentinel-scenes?days=90','POST',cookie)).data;console.log('Scenes imported',result.ingestion.imported)}}
 catch(e){result.errors.push('Scene ingestion: '+e.message);console.warn(result.errors.at(-1))}
 try{result.processing=(await req('/api/fields/'+id+'/ndvi/process-latest','POST',cookie,undefined,180000)).data;console.log('Scene accepted',result.processing.accepted,'attempts',result.processing.attempts?.length)}
 catch(e){result.errors.push('Raster processing: '+e.message);console.warn(result.errors.at(-1))}
 for(const [key,url] of [['weather','/weather'],['ndvi','/ndvi']]){
  try{result[key]=(await req('/api/fields/'+id+url,'GET',cookie)).data}catch(e){result.errors.push(key+': '+e.message)}
 }
 const accepted=result.ndvi.filter(x=>x.accepted&&x.provenance==='measured_imagery');
 const latest=accepted.at(-1);
 result.summary={weatherDays:result.weather.length,measurements:result.ndvi.length,acceptedMeasurements:accepted.length,latestAccepted:latest?{date:latest.observed_on,ndvi:latest.ndvi_value,ndre:latest.ndre_value,ndmi:latest.ndmi_value,evi:latest.evi_value,savi:latest.savi_value,validCoveragePercent:latest.valid_coverage_percent,validPixelCount:latest.valid_pixel_count,qualityReason:latest.quality_reason,source:latest.source}:null};
 reports.push(result);
 console.log('Weather',result.summary.weatherDays,'accepted NDVI',accepted.length);
}
await mkdir('.local',{recursive:true});
const filename='.local/tushar-satellite-report-'+new Date().toISOString().replaceAll(':','-')+'.json';
await writeFile(filename,JSON.stringify({generatedAt:new Date().toISOString(),account:credentials.email,disclaimer:'Demo boundaries are illustrative. Satellite values are real imagery measurements at those polygons, not evidence of the actual farmer crops. No disease diagnosis or yield forecast.',reports},null,2));
console.log('\nSaved',filename);
console.log('Accepted fields',reports.filter(x=>x.summary.acceptedMeasurements>0).length,'/',reports.length);
