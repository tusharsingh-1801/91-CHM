import {demoForecast} from '../../../shared/forecast';
/** Self-contained fictional showcase. Enabled only by ?demo=1; no database or providers. */
import { assessEvidence, type Observation } from '../../../shared/evidence';
import type { DatabaseField } from './api';
import { cropPhoto } from './cropPhotos';
const anchor = Date.now();
const date = (days:number) => new Date(anchor-days*86400000).toISOString().slice(0,10);
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type Field = DatabaseField;
const crops=[['Wheat North','Wheat',.46,.73,3,2],['Rice East','Rice',.68,.67,2,1],['Maize Riverside','Maize',.75,.52,4,0],['Mustard West','Mustard',.55,.56,32,0],['Cotton Block','Cotton',.4,.66,2,0],['Sugarcane','Sugarcane',.68,.64,3,0],['Potato South','Potato',.58,.61,5,2],['Newly Added Field','Unknown',null,null,0,0],
 ['Wheat Canal Plot','Wheat',.72,.68,1,1],['Rice South Terrace','Rice',.76,.71,2,0],
 ['Maize Hill Farm','Maize',.43,.65,3,2],['Mustard Golden Plot','Mustard',.69,.66,2,1],
 ['Cotton East Acres','Cotton',.67,.63,4,0],['Sugarcane Canal Side','Sugarcane',.81,.77,1,1],
 ['Potato Valley','Potato',.62,.59,2,2],['Rice Monsoon Plot','Rice',.74,.72,3,0],
 ['Wheat Orchard Edge','Wheat',.49,.7,2,1],['Maize Meadow','Maize',.78,.71,1,0],
 ['Mustard Riverbank','Mustard',.65,.61,4,1],['Cotton South Block','Cotton',.71,.68,2,0],
 ['Potato Creek Plot','Potato',.39,.62,3,2],['Sugarcane West Acres','Sugarcane',.79,.74,2,0],
 ['Rice Lakeside','Rice',.7,.67,1,1],['Wheat Sunrise Farm','Wheat',.73,.69,2,0]] as const;
const polygon=(i:number)=>({type:'Polygon',coordinates:[[[77.41+i*.014,28.55+i*.008],[77.418+i*.014,28.55+i*.008],[77.418+i*.014,28.558+i*.008],[77.41+i*.014,28.558+i*.008],[77.41+i*.014,28.55+i*.008]] ]});
const indexObs=(i:number,ndvi:number,ago:number):Observation=>({
 scene_id:`SHOWCASE-S2-${i}-${ago}`,observed_on:date(ago),acquired_at:new Date(anchor-ago*86400000).toISOString(),
 ndvi_value:ndvi,ndmi_value:Number((ndvi*.55-.08).toFixed(3)),ndre_value:Number((ndvi*.68).toFixed(3)),
 cloud_cover:i===4?82:12,valid_coverage_percent:i===4?24:91,valid_pixel_count:i===4?4:720,
 source:'Illustrative Sentinel-2 scenario',provenance:'measured_imagery',accepted:i!==4,boundary_version:1,calculation_version:'showcase-v1'
});
const observations=new Map<string,Observation[]>();
const tasks=new Map<string,Array<Record<string,unknown>>>();
const events=new Map<string,Array<Record<string,unknown>>>();
const alerts=new Map<string,Array<Record<string,unknown>>>();
const scouting=new Map<string,Array<Record<string,unknown>>>();
const jobs=new Map<string,Array<Record<string,unknown>>>();
const noticeRecords=new Map<string,Array<Record<string,unknown>>>();noticeRecords.set('account',[]);
const conversations=new Map<string,Array<Record<string,unknown>>>();
const preferenceRecords=new Map<string,Array<Record<string,unknown>>>();preferenceRecords.set('account',[{visits:true,imagery:true,processing:true,weather:true,browser:false}]);
const fields:Field[]=crops.map(([name,crop,ndvi,previous,age,due],i)=>{
 const id=uuid(i+1),base=ndvi===null?[]:[indexObs(i,ndvi,age),...(previous===null?[]:[indexObs(i,previous,age+9),...Array.from({length:16},(_,n)=>indexObs(i,Number(Math.max(.12,Math.min(.88,previous-.012*n+.04*Math.sin(n+i))).toFixed(3)),age+14+n*5))])];
 observations.set(id,base);
 tasks.set(id,Array.from({length:due},(_,j)=>({id:uuid(100+i*4+j),field_id:id,title:j?'Review irrigation':'Inspect north boundary',reason:'Scheduled inspection',due_on:date(j),status:'open',scene_id:base[0]?.scene_id||null,boundary_version:1})));
 events.set(id,[{id:uuid(200+i),field_id:id,event_type:'planting',event_date:date(120+i),notes:`Illustrative ${crop} sowing record`,created_at:new Date().toISOString()}]);
 scouting.set(id,Array.from({length:3},(_,j)=>({id:uuid(10000+i*10+j),field_id:id,observed_on:date(2+j*8),crop,
 symptoms:j===0&&i%4===0?'Yellowing near the irrigation channel; check water flow.':'Uniform leaf colour; no unusual marks seen during the sample visit.',
 notes:['Sample morning walk: checked leaves, soil moisture and irrigation outlets.','Sample follow-up: compared the north edge with the centre of the parcel.','Sample weekly visit: recorded crop growth and photographed the canopy.'][j],
 diagnosis_status:'unavailable',diagnosis:{},photos:[{id:uuid(11000+i*10+j),width:1000,height:667,quality:'Sample reference photo · not a diagnosis',preview_url:cropPhoto(crop).src}]})));
 alerts.set(id,i===0?[{id:uuid(300+i),title:'Vegetation decrease: inspect in person',severity:'neutral',observed_at:date(age),resolved:false,action_status:'open',scene_id:base[0]?.scene_id,stress_geojson:null}]:[]);
 jobs.set(id,[{id:uuid(12000+i*2),field_id:id,kind:'satellite',status:'succeeded',progress:'Sample imagery processed',boundary_version:1,created_at:new Date(anchor-2*3600000).toISOString(),finished_at:new Date(anchor-3600000).toISOString(),result:{accepted:base[0]?.accepted??false,sceneId:base[0]?.scene_id},error:null},
 {id:uuid(12001+i*2),field_id:id,kind:'weather',status:'succeeded',progress:'90 daily readings ready',boundary_version:1,created_at:new Date(anchor-3*3600000).toISOString(),finished_at:new Date(anchor-2*3600000).toISOString(),result:{imported:90},error:null}]);
 const diary=events.get(id)!;
 for(let j=0;j<11;j++)diary.push({id:uuid(13000+i*20+j),field_id:id,event_type:['irrigation','scouting','fertilizer','other'][j%4],event_date:date(3+j*7),notes:['Sample irrigation: inspected drip lines and cleared the outlet.','Sample scouting: photographed leaf colour and checked the field boundary.','Sample nutrient record: logged the scheduled soil review.','Sample maintenance: repaired the path and checked the weather log.'][j%4],created_at:new Date(anchor-(3+j*7)*86400000).toISOString()});
 const planned=tasks.get(id)!;
 for(let j=0;j<4;j++)planned.push({id:uuid(14000+i*10+j),field_id:id,title:['Check irrigation outlets','Weekly crop photo walk','Review soil moisture','Inspect field boundary'][j],reason:'Sample farm maintenance plan',due_on:date(j<2?-j-1:7+j),status:j<2?'open':'resolved',scene_id:base[0]?.scene_id??null,boundary_version:1});
 if(i>7&&i%4===0)alerts.set(id,[{id:uuid(15000+i),title:'Sample greenness change: inspect irrigation and canopy',severity:'neutral',observed_at:date(age),resolved:false,action_status:'open',scene_id:base[0]?.scene_id,stress_geojson:null}]);
 const latest=base[0]||null,older=base[1]||null;return {
 id,name,crop,area_hectares:Number((1+i*.34).toFixed(2)),health_score:null,health_delta:null,canopy_coverage:0,
 ndvi_average:ndvi,latitude:28.554+i*.008,longitude:77.414+i*.014,boundary_geojson:polygon(i),boundary_version:1,
 planting_date:date(120+i),harvest_date:date(-35-i),expected_yield_tons:Number((3.5+i*.8).toFixed(1)),last_observation:latest?.observed_on||null,
 provenance:'user_reported' as const,isDemo:false,latestObservation:latest,previousObservation:older,
 assessment:assessEvidence(latest,older),dueTasks:due,latestJob:null,latest_scene_id:latest?.scene_id||null,
 };
});
const weather=(id:string)=>Array.from({length:90},(_,i)=>({
 id:uuid(1000+i),observed_on:date(89-i),temperature_c:Math.round((23+6*Math.sin(i/6)+Number(id.slice(-2))*.04)*10)/10,
 precipitation_mm:i%9===0?15.2:i%5===0?3.5:0,humidity_percent:Math.round(49+21*Math.cos(i/7)),
 source_url:'https://example.invalid/showcase-weather',field_id:id
}));
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const result=(fieldId:string)=>fields.find(f=>f.id===fieldId);
const mockTiles=new Response('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#619f58" opacity=".55"/><path d="M0 80L256 140M-20 190L280 30" stroke="#daec72" stroke-width="52" opacity=".4"/><path d="M60 0L120 256" stroke="#317f4a" stroke-width="36" opacity=".5"/></svg>',{headers:{'content-type':'image/svg+xml'}});
async function respond(path:string,method:string,body:Record<string,unknown>,search:string):Promise<Response>{
 if(path==='/api/auth/session')return json({mode:'local',user:null});
 if(path==='/api/health')return json({status:'ok',database:'showcase-memory'});
 if(path==='/api/fields'){
  if(method==='POST'){
   const id=crypto.randomUUID(),field={...fields[7],...body,id,name:String(body.name||'New field'),crop:String(body.crop||'Unknown'),boundary_geojson:body.boundary_geojson as Record<string,unknown>,latestObservation:null,previousObservation:null,last_observation:null,latest_scene_id:null,ndvi_average:null,dueTasks:0,assessment:assessEvidence(null,null)};
   fields.push(field);observations.set(id,[]);tasks.set(id,[]);events.set(id,[]);alerts.set(id,[]);scouting.set(id,[]);jobs.set(id,[]);return json(field,201);
  }
  return json(fields.map(f=>({...f,latestJob:jobs.get(f.id)?.[0]||null,dueTasks:(tasks.get(f.id)||[]).filter(t=>t.status!=='resolved'&&String(t.due_on)<=date(0)).length})));
 }
 if(path==='/api/assistant/status')return json({configured:true,provider:'gemini',history:true,model:'showcase',mode:'demo'});
 if(path==='/api/assistant/history'){
  if(method==='DELETE'){conversations.clear();return json({ok:true});}
  return json(conversations.get(new URLSearchParams(search).get('fieldId')||'general')||[]);
 }
 if(path==='/api/notifications'){
  const records=noticeRecords.get('account')||[];
  for(const [i,field] of fields.entries()){
   const candidates=[{id:uuid(60000+i*5),field_id:field.id,field_name:field.name,title_en:'Sample satellite processing completed',title_hi:'नमूना सैटेलाइट प्रोसेसिंग पूरी हुई',kind:'processing',href:`/fields/${field.id}/overview`,read_at:null},...(field.assessment?.state==='needs_inspection'?[{id:uuid(60001+i*5),field_id:field.id,field_name:field.name,title_en:'A sample field visit is recommended',title_hi:'नमूना खेत की जाँच करें',kind:'imagery',href:`/fields/${field.id}/map`,read_at:null}]:[]),...(Number(field.dueTasks)>0?[{id:uuid(60002+i*5),field_id:field.id,field_name:field.name,title_en:'Sample planned visits are due',title_hi:'खेत की नमूना जाँच बाकी है',kind:'visits',href:`/fields/${field.id}/overview#planned-tasks`,read_at:null}]:[])];
   for(const item of candidates)if(!records.some(record=>record.id===item.id))records.push({...item,created_at:new Date().toISOString()});
  }
  noticeRecords.set('account',records);return json({notifications:records,preferences:preferenceRecords.get('account')?.[0],mode:'demo'});
 }
 if(path==='/api/notifications/read'){for(const item of noticeRecords.get('account')||[])if(body.all===true||(Array.isArray(body.ids)&&body.ids.includes(item.id)))item.read_at=new Date().toISOString();return json({ok:true});}
 if(path==='/api/notifications/preferences'){preferenceRecords.set('account',[body]);return json({preferences:body});}
 if(path==='/api/assistant') {
  const question=String(body.message||'').toLowerCase();
  const field=fields.find(f=>f.id===body.fieldId);
  const hindi=body.languageCode==='hi-IN';
  const subject=field?.name|| (hindi?'आपका खेत':'your field');
  const ndvi=field?.latestObservation?.ndvi_value;
  const answer= /weather|rain|temperature|मौसम|बारिश|तापमान/.test(question)
    ? (hindi?`पिछले 90 दिनों के नमूना मौसम रिकॉर्ड में तापमान, बारिश और नमी देख सकते हैं। ${subject} की मौसम जानकारी Changes over time में देखें।`:`The example weather history contains 90 days of temperature, rainfall and humidity readings. Open Changes over time to review the weather for ${subject}.`)
    : /ndvi|green|satellite|हरियाली|सैटेलाइट/.test(question)
      ? (hindi?`${subject} की हाल की नमूना NDVI रीडिंग ${ndvi??'उपलब्ध नहीं'} है। NDVI हरियाली का संकेत है, बीमारी की निश्चित पहचान नहीं।`:`The latest example NDVI for ${subject} is ${ndvi??'unavailable'}. NDVI indicates vegetation greenness, not a confirmed disease diagnosis.`)
      : (hindi?`${subject} में पत्तियाँ, पानी, मिट्टी और कीटों के निशान देखें। नक्शे और डायरी की मदद से अगली जाँच का रिकॉर्ड बनाएँ।`:`For ${subject}, inspect leaves, water, soil and signs of pests. Use the map and field diary to record your next visit.`);
  if(body.saveHistory===true){const key=String(body.fieldId||'general');const records=conversations.get(key)||[];records.push({role:'user',content:String(body.message||'')},{role:'assistant',content:answer});conversations.set(key,records.slice(-30));}
  return json({answer,model:'showcase',languageCode:body.languageCode||'en-IN',evidenceDates:field?.latestObservation?[field.latestObservation.observed_on]:[]});
 }
 const match=path.match(/^\/api\/fields\/([^/]+)(?:\/(.*))?$/);if(!match)return json({error:'Not found'},404);
 const fieldId=match[1],section=match[2]||'',field=result(fieldId);if(!field)return json({error:'Field not found'},404);
 const data=observations.get(fieldId)||[];
 if(!section){
  if(method==='DELETE'){fields.splice(fields.indexOf(field),1);return new Response(null,{status:204});}
  if(method==='PATCH'){Object.assign(field,body);return json(field);}
  return json(field);
 }
 if(section==='boundary'&&method==='PATCH'){field.boundary_geojson=body.boundary_geojson as Record<string,unknown>;field.boundary_version=(field.boundary_version||1)+1;return json({boundary_version:field.boundary_version});}
 if(section==='ndvi')return json(data);
 if(section==='ndvi/analysis')return json({status:'analysed',statusLabel:'Illustrative vegetation trend',trend:field.assessment?.change!=null&&field.assessment.change<-.1?'declining':'stable',summary:`${data.length} sample satellite observations show seasonal crop development.`,recommendation:'Inspect the field before taking action.',observations:data.length,average:field.ndvi_average,slopePerDay:data.length>1?Number((Number(data[0].ndvi_value)-Number(data[1].ndvi_value))/9):null,languageCode:new URLSearchParams(search).get('language')||'en-IN',source:'showcase'});
 if(section==='datasets')return json({items:[],hasMore:false,offset:0,limit:1});
 if(section==='forecast')return json(demoForecast());
 if(section==='weather')return json(weather(fieldId));
 if(section==='scenes')return json(data.map(o=>({scene_id:o.scene_id,observed_at:o.acquired_at,cloud_cover:o.cloud_cover,processing_status:o.accepted?'processed':'rejected',valid_coverage_percent:o.valid_coverage_percent,valid_pixel_count:o.valid_pixel_count})));
 if(section==='alerts'){return json(alerts.get(fieldId)||[]);}
 if(section.startsWith('alerts/')&&method==='PATCH'){const alert=(alerts.get(fieldId)||[]).find(a=>a.id===section.split('/')[1]);if(alert){alert.action_status=body.status||'resolved';alert.resolved=alert.action_status==='resolved';}return json(alert||{});}
 if(section==='events'){
  const records=events.get(fieldId)||[];if(method==='POST'){const existing=body.client_key?records.find(item=>item.client_key===body.client_key):null;if(existing)return json(existing,201);const record={id:crypto.randomUUID(),field_id:fieldId,...body,created_at:new Date().toISOString()};records.unshift(record);return json(record,201);}return json(records);
 }
 if(section.startsWith('events/')&&method==='DELETE'){const records=events.get(fieldId)||[];const i=records.findIndex(e=>e.id===section.split('/')[1]);if(i>=0)records.splice(i,1);return new Response(null,{status:204});}
 if(section==='tasks'){
  const records=tasks.get(fieldId)||[];if(method==='POST'){let task=records.find(t=>t.client_key===body.client_key);if(!task){task={id:crypto.randomUUID(),field_id:fieldId,...body,status:'open',boundary_version:field.boundary_version};records.unshift(task);}return json(task,201);}return json(records);
 }
 if(section.startsWith('tasks/')&&method==='PATCH'){const task=(tasks.get(fieldId)||[]).find(t=>t.id===section.split('/')[1]);if(task)task.status=body.status;return json(task||{});}
 if(section==='scouting'){
  const cases=scouting.get(fieldId)||[];if(method==='POST'){const item={id:crypto.randomUUID(),observed_on:body.observed_on,crop:body.crop||field.crop,symptoms:body.symptoms||'',notes:body.notes||'',diagnosis_status:'unavailable',diagnosis:{},photos:[{id:uuid(8000+cases.length),width:640,height:480,quality:'recorded',preview_url:body.image||cropPhoto(field.crop).src}]};cases.unshift(item);return json(item,201);}return json({cases,diagnosis:{status:'unavailable',provider:null,reason:'Showcase photo records only'}});
 }
 if(section.startsWith('scouting/')&&method==='DELETE'){
  const records=scouting.get(fieldId)||[];const index=records.findIndex(item=>item.id===section.split('/')[1]);if(index>=0)records.splice(index,1);return new Response(null,{status:204});
 }
 if(section==='jobs'){
  const records=jobs.get(fieldId)||[];if(method==='POST'){const kind=body.kind==='weather'?'weather':'satellite';
   if(kind==='satellite'&&(!data.length||data[0].boundary_version!==field.boundary_version)){
    const index=fields.indexOf(field);
    const reading={...indexObs(index,.64,1),accepted:true,cloud_cover:8,valid_coverage_percent:94,valid_pixel_count:840,boundary_version:field.boundary_version||1};
    data.unshift(reading);observations.set(fieldId,data);field.latestObservation=reading;field.previousObservation=null;field.last_observation=reading.observed_on;field.latest_scene_id=reading.scene_id;field.ndvi_average=reading.ndvi_value;field.assessment=assessEvidence(reading,null);
   }
   const job={id:crypto.randomUUID(),field_id:fieldId,boundary_version:field.boundary_version||1,kind,status:'succeeded',progress:'Complete',result:kind==='weather'?{imported:90}:{accepted:data.length>0,sceneId:data[0]?.scene_id},error:null,created_at:new Date().toISOString(),finished_at:new Date().toISOString()};records.unshift(job);return json(job,202);}return json(records);
 }
 if(section==='ndvi/process-latest')return json({accepted:data.length>0,sceneId:data[0]?.scene_id,ndvi:data[0]?.ndvi_value,validCoverage:data[0]?.valid_coverage_percent,attempts:data.length?[{sceneId:data[0].scene_id,status:'accepted'}]:[]});
 if(section==='ingest/weather')return json({source:'showcase',imported:90});
 if(section==='ingest/sentinel-scenes')return json({source:'showcase',imported:data.length});
 if(section.startsWith('ndvi/from-scene/'))return json({sceneId:section.split('/')[2],ndvi:data[0]?.ndvi_value||0,validPixels:720,validCoverage:91,healthScore:70,source:'showcase',accepted:true,qualityReason:null});
 if(section.startsWith('tiles/'))return mockTiles.clone();
 if(section.startsWith('overlay/'))return json({image:'',bounds:{north:Number(field.latitude)+.004,south:Number(field.latitude)-.004,east:Number(field.longitude)+.004,west:Number(field.longitude)-.004}});
 return json([]);
}
export function enableShowcase(){
 const storageKey='terrascope:demo-records:v2';
 const collections={observations,tasks,events,alerts,scouting,jobs,noticeRecords,conversations,preferenceRecords};
 try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved?.version===2&&Array.isArray(saved.fields)){
  fields.splice(0,fields.length,...saved.fields);
  for(const [name,collection] of Object.entries(collections)){if(Array.isArray(saved[name])){collection.clear();for(const [id,items] of saved[name])collection.set(id,items);}}
 }}catch{/* Use fresh fixtures when storage is unavailable. */}
 const original=window.fetch.bind(window);
 window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.toString():input.url,window.location.origin);
  if(url.origin!==window.location.origin||!url.pathname.startsWith('/api/'))return original(input,init);
  let body:Record<string,unknown>={};try{body=JSON.parse(String(init?.body||'{}'));}catch{/* no body */}
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const response=await respond(url.pathname,method,body,url.search);
  if(!['GET','HEAD'].includes(method)&&response.ok)try{sessionStorage.setItem(storageKey,JSON.stringify({version:2,fields,...Object.fromEntries(Object.entries(collections).map(([name,items])=>[name,[...items]]))}));}catch{/* Demo remains usable if the tab storage is full. */}
  return response;
 };
}
