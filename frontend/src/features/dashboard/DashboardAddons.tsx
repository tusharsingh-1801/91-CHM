import {SatelliteDateComparison} from '../fields/SatelliteDateComparison';
import { useEffect, useMemo, useRef, useState } from 'react';
import './dashboard-addons.css';
import './observation-quality.css';
import { ObservationQualityPanel } from './ObservationQualityPanel';
import {ForecastPreview} from './ForecastPreview';
import { FieldHealthLeaderboard } from './FieldHealthLeaderboard';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import { Bot, CalendarDays, CloudSun, Droplets, Images, MapPinned, MoveDownRight, MoveUpRight, Minus, Thermometer, Waves, ArrowRight, Activity, Clock } from 'lucide-react';
import { cropPhoto, cropPhotos } from '../../lib/cropPhotos';
import { usePreferences } from '../../lib/preferencesContext';
import { loadFieldEvents, loadFieldJobs, loadFieldTasks, loadNdvi, loadWeather, type DatabaseField, type FieldEvent, type FieldTask, type ProcessingJob, type VegetationIndexObservation, type WeatherObservation } from '../../lib/api';

type FieldExtra = { observations: VegetationIndexObservation[]; weather: WeatherObservation[]; events: FieldEvent[]; tasks: FieldTask[]; jobs: ProcessingJob[] };
const empty:FieldExtra = { observations:[], weather:[], events:[], tasks:[], jobs:[] };
type FeedItem = {id:string;fieldId:string;fieldName:string;date:string;title:string;description:string};
type VisitItem = {id:string;fieldId:string;fieldName:string;title:string;due:string;status:string};
const validNumber=(value:unknown):number|null=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
function filteredReadings(items:VegetationIndexObservation[],field:DatabaseField){
 return items.filter(item=>item.accepted&&item.provenance==='measured_imagery'&&item.boundary_version===(field.boundary_version??1)&&validNumber(item.ndvi_value)!==null)
 .sort((a,b)=>b.observed_on.localeCompare(a.observed_on));
}
function FarmMap({fields}:{fields:DatabaseField[]}){
 const element=useRef<HTMLDivElement>(null);
 const navigate=useNavigate();
 const {t}=usePreferences();
 useEffect(()=>{
  if(!element.current)return;
  const map=L.map(element.current,{scrollWheelZoom:false,zoomControl:true,attributionControl:true}).setView([28.6,77.4],11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
  const all:L.LatLngBounds[]=[];
  fields.forEach(field=>{
   const state=field.assessment?.state;
   const color=state==='needs_inspection'?'#d56e31':state==='no_unusual_change'?'#27884d':'#c3a040';
   let position:L.LatLngExpression|null=null;
   if(field.boundary_geojson){
    try{
     const layer=L.geoJSON(field.boundary_geojson as unknown as GeoJsonObject,{style:{color,weight:3,fillColor:color,fillOpacity:.27}});
     if(layer.getBounds().isValid()){
      layer.addTo(map);all.push(layer.getBounds());position=layer.getBounds().getCenter();
      layer.on('click',()=>navigate('/fields/'+field.id+'/overview'));
      const label=document.createElement('span');label.textContent=field.name;
      layer.bindTooltip(label,{sticky:true});
     }
    }catch{/* bad polygon: point marker can still appear */}
   }
   if(!position&&validNumber(field.latitude)!==null&&validNumber(field.longitude)!==null){
    position=[Number(field.latitude),Number(field.longitude)];
   }
   if(position){
    const marker=L.circleMarker(position,{radius:7,color:'#fff',weight:2,fillColor:color,fillOpacity:1}).addTo(map);
    const label=document.createElement('span');label.textContent=field.name;
    marker.bindTooltip(label);
    marker.on('click',()=>navigate('/fields/'+field.id+'/overview'));
    if(!all.length||!field.boundary_geojson)all.push(L.latLngBounds(position,position));
   }
  });
  if(all.length){const allBounds=all[0];for(const bounds of all.slice(1))allBounds.extend(bounds);map.fitBounds(allBounds.pad(.22),{maxZoom:15,animate:false});}
  map.invalidateSize();
  return ()=>{map.remove();};
 },[fields,navigate]);
 return <div className="addon-map-wrap"><div ref={element} className="addon-map" aria-label={t('All-fields satellite overview map','सभी खेतों का नक्शा')}/><div className="addon-map-legend"><span><i className="addon-dot red"/>{t('Visit','जाँच')}</span><span><i className="addon-dot green"/>{t('Routine','सामान्य')}</span><span><i className="addon-dot amber"/>{t('Need imagery','तस्वीर चाहिए')}</span></div></div>;
}
function VegetationPreview({value,scene}:{value:number;scene:string}){
 const color=value<.2?'#c9a24f':value<.45?'#a6ad4b':value<.65?'#6f9f51':'#297548';
 return <div className="addon-satellite-tile" style={{backgroundColor:color}} aria-label={`Vegetation image illustration NDVI ${value.toFixed(2)}`}>
   <div className="addon-satellite-furrows"/><small>NDVI {value.toFixed(2)}</small><span>{scene}</span>
  </div>;
}
export function DashboardAddons({fields}:{fields:DatabaseField[]}){
 const {t,date}=usePreferences();
 const [details,setDetails]=useState<Record<string,FieldExtra>>({});
 const [selectedId,setSelectedId]=useState('');
 const [oldScene,setOldScene]=useState('');
 const [newScene,setNewScene]=useState('');
 const [pending,setPending]=useState(true);
 const [expanded,setExpanded]=useState(true);
 const dataset=useMemo(()=>fields,[fields]);
 useEffect(()=>{
  if(!dataset.length){setPending(false);return;}
  let cancelled=false;setPending(true);
  void Promise.all(dataset.map(async field=>{
   const settled=await Promise.allSettled([
    loadNdvi(field.id),loadWeather(field.id),loadFieldEvents(field.id),loadFieldTasks(field.id),loadFieldJobs(field.id)
   ]);
   const read=<T,>(index:number,fallback:T):T=>settled[index].status==='fulfilled'?(settled[index] as PromiseFulfilledResult<T>).value:fallback;
   return [field.id,{observations:read(0,[] as VegetationIndexObservation[]),weather:read(1,[] as WeatherObservation[]),events:read(2,[] as FieldEvent[]),tasks:read(3,[] as FieldTask[]),jobs:read(4,[] as ProcessingJob[])}] as const;
  })).then(entries=>{if(!cancelled){setDetails(Object.fromEntries(entries));setPending(false);}}).catch(()=>{if(!cancelled)setPending(false);});
  return ()=>{cancelled=true;};
 },[dataset]);
 const inspected=useMemo(()=>dataset.filter(field=>filteredReadings(details[field.id]?.observations||[],field).length>=2),[dataset,details]);
 const current=inspected.find(f=>f.id===selectedId)||inspected[0];
 const readings=current?filteredReadings(details[current.id]?.observations||[],current):[];
 const older=readings.find(o=>o.scene_id===oldScene)||readings[1];
 const newer=readings.find(o=>o.scene_id===newScene)||readings[0];
 const allWeather=dataset.flatMap(f=>(details[f.id]?.weather||[]).map(w=>({...w,fieldName:f.name})));
 const latestWeatherField=dataset.find(f=>(details[f.id]?.weather||[]).length>0);
 const weather=(latestWeatherField?details[latestWeatherField.id]?.weather||[]:[]).slice().sort((a,b)=>b.observed_on.localeCompare(a.observed_on)).slice(0,7);
 const mean=(key:'temperature_c'|'humidity_percent')=>{const available=weather.map(w=>validNumber(w[key])).filter((n):n is number=>n!==null);return available.length?available.reduce((sum,n)=>sum+n,0)/available.length:null;};
 const rainfall=weather.map(w=>validNumber(w.precipitation_mm)).filter((n):n is number=>n!==null); 
 const rain=rainfall.length?rainfall.reduce((sum,n)=>sum+n,0):null;
 const activity:FeedItem[]=dataset.flatMap(field=>{
  const e=details[field.id]||empty;
  return [
   ...e.events.map(event=>({id:'event-'+event.id,fieldId:field.id,fieldName:field.name,date:event.event_date,title:event.event_type.replace(/_/g,' '),description:event.notes||t('Field diary entry','खेत का रिकॉर्ड')})),
   ...e.jobs.map(job=>({id:'job-'+job.id,fieldId:field.id,fieldName:field.name,date:String(job.created_at||'').slice(0,10),title:job.kind==='weather'?t('Weather update','मौसम अपडेट'):t('Satellite check','सैटेलाइट जाँच'),description:job.status}))
  ];
 }).filter(item=>item.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
 const visits:VisitItem[]=dataset.flatMap(field=>(details[field.id]?.tasks||[]).filter(task=>task.status!=='resolved')
  .map(task=>({id:task.id,fieldId:field.id,fieldName:field.name,title:task.title,due:task.due_on||'',status:task.status})))
  .filter(item=>item.due).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,6);
 const insights=dataset.map(field=>{
  const obs=filteredReadings(details[field.id]?.observations||[],field);
  const diff=obs.length>1?Number(obs[0].ndvi_value)-Number(obs[1].ndvi_value):null;
  return {field,latest:obs[0],diff};
 }).filter(item=>item.latest).slice(0,4);
 const photoFields=dataset.slice(0,4);
 const openAI=(question:string)=>{
  const button=document.querySelector<HTMLButtonElement>('.crop-assistant-launch');
  button?.click();
  window.dispatchEvent(new CustomEvent('terrascope:assistant-question',{detail:{question}}));
 };
 return <section id="farm-addons" className="dashboard-addons" aria-label={t('Farm insights and previews','खेतों की जानकारी और झलक')}>
  <div className="addon-heading"><div><span className="eyebrow">{t('ADDITIONAL FARM TOOLS','खेतों के अतिरिक्त साधन')}</span><h2>{t('Your farm at a glance','आपके खेत एक नज़र में')}</h2><p>{t('Explore your fields, recent readings and upcoming actions.','खेत, हाल की रीडिंग और अगले काम देखें।')}</p></div><button type="button" onClick={()=>setExpanded(value=>!value)} className="addon-toggle" aria-expanded={expanded} aria-controls="addon-advanced-section">{expanded?t('Show less','कम दिखाएँ'):t('Show more details','और जानकारी')}</button></div>
  <div className="addon-primary-grid">
   <article className="addon-card addon-map-card"><h3><MapPinned size={19}/>{t('All fields on one map','सभी खेत एक नक्शे पर')}</h3><p>{t('Tap a field boundary to open its details.','खेत पर दबाकर उसकी जानकारी खोलें।')}</p><FarmMap fields={dataset}/></article>
   <article className="addon-card addon-weather-card"><h3><CloudSun size={19}/>{t('Weather · last 7 days','मौसम · पिछले 7 दिन')}</h3>
    {weather.length?<><p className="addon-subtle">{t('Historical NASA POWER data; not a forecast.','NASA POWER का पुराना मौसम डेटा; भविष्यवाणी नहीं।')} · {latestWeatherField?.name} · {date(weather[0]?.observed_on)} {t('and earlier','और उससे पहले')}</p>
     <div className="addon-weather-grid"><div><Thermometer/><strong>{mean('temperature_c')===null?t('Not available','उपलब्ध नहीं'):`${mean('temperature_c')!.toFixed(1)}°C`}</strong><span>{t('Average temperature','औसत तापमान')}</span></div><div><Droplets/><strong>{rain===null?t('Not available','उपलब्ध नहीं'):`${rain.toFixed(1)} mm`}</strong><span>{t('Total rain','कुल बारिश')}</span></div><div><Waves/><strong>{mean('humidity_percent')===null?t('Not available','उपलब्ध नहीं'):`${mean('humidity_percent')!.toFixed(0)}%`}</strong><span>{t('Average humidity','औसत नमी')}</span></div></div>
     <div className="addon-weather-days">{weather.slice().reverse().map(w=><div key={w.id+w.observed_on}><small>{date(w.observed_on).split(' ')[0]}</small><b>{validNumber(w.temperature_c)===null?'—':`${Math.round(validNumber(w.temperature_c)!)}°`}</b><span>{validNumber(w.precipitation_mm)===null?'—':`${validNumber(w.precipitation_mm)!.toFixed(0)} mm`}</span></div>)}</div>
    </>:<p>{pending?t('Loading weather…','मौसम ला रहे हैं…'):t('No weather data available','मौसम की जानकारी नहीं मिली')}</p>}
   </article>
  </div>
  <ForecastPreview fields={dataset}/>
  <ObservationQualityPanel fields={dataset}/>
  <FieldHealthLeaderboard fields={fields}/>
  <article className="addon-card addon-insights"><h3><Activity size={19}/>{t('Crop insights','फ़सल के बदलाव')}</h3><div className="addon-insight-grid">{insights.length?insights.map(({field,latest,diff})=>{
   const direction=diff===null?'none':diff<-.03?'down':diff>.03?'up':'stable';
   const Icon=direction==='down'?MoveDownRight:direction==='up'?MoveUpRight:Minus;
   return <Link key={field.id} to={'/fields/'+field.id+'/analysis'} className="addon-insight"><div className={'addon-insight-icon '+direction}><Icon/></div><strong>{field.name}</strong><span>{direction==='down'?t('Less green than before','पहले से हरियाली कम'):direction==='up'?t('Greener than before','पहले से ज़्यादा हरियाली'):direction==='stable'?t('Almost the same','लगभग समान'):t('One image available','एक तस्वीर उपलब्ध')}</span><small>{date(latest.observed_on)} · NDVI {Number(latest.ndvi_value).toFixed(2)}</small></Link>;
  }):<p>{pending?t('Checking satellite readings…','रीडिंग देख रहे हैं…'):t('Two clear image dates are needed for trends.','बदलाव के लिए दो तस्वीरें चाहिए।')}</p>}</div></article>
  <div className="addon-secondary-grid addon-more-detail" id="addon-advanced-section" hidden={!expanded}>
   <article className="addon-card addon-comparison"><h3><Images size={19}/>{t('Compare two satellite dates','सैटेलाइट की दो तारीख़ें तुलना करें')}</h3>
    {current&&older&&newer?<><label>{t('Field','खेत')} <select value={current.id} onChange={e=>{setSelectedId(e.target.value);setOldScene('');setNewScene('');}}>{inspected.map(field=><option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
     <div className="addon-comparison-controls"><label>{t('Before','पहले')}<select value={older.scene_id??''} onChange={e=>setOldScene(e.target.value)}>{readings.filter(o=>o.scene_id!==newer.scene_id).map(o=><option value={o.scene_id??''} key={o.scene_id}>{date(o.observed_on)}</option>)}</select></label><label>{t('After','बाद में')}<select value={newer.scene_id??''} onChange={e=>setNewScene(e.target.value)}>{readings.filter(o=>o.scene_id!==older.scene_id).map(o=><option value={o.scene_id??''} key={o.scene_id}>{date(o.observed_on)}</option>)}</select></label></div>
     <div className="addon-comparison-images"><div><VegetationPreview value={Number(older.ndvi_value)} scene={date(older.observed_on)}/><small>{t('Earlier image representation','पहली तस्वीर का चित्रण')}</small></div><div><VegetationPreview value={Number(newer.ndvi_value)} scene={date(newer.observed_on)}/><small>{t('Later image representation','बाद की तस्वीर का चित्रण')}</small></div></div>
     <p className="addon-change-note">{t('Greenness difference','हरियाली का अंतर')}: <strong>{(Number(newer.ndvi_value)-Number(older.ndvi_value)).toFixed(2)}</strong> · {t('Illustrative colour representation from NDVI readings, not original satellite pixels.','NDVI से बनाया रंगीन चित्र, असली सैटेलाइट पिक्सल नहीं।')}</p>
     <SatelliteDateComparison key={current.id} field={current} observations={readings}/>
     <Link to={'/fields/'+current.id+'/analysis'}>{t('Open detailed trend','पूरा ग्राफ़ देखें')} <ArrowRight size={16}/></Link>
    </>:<p>{t('Add two accepted images to compare dates.','तुलना के लिए दो तस्वीरें चाहिए।')}</p>}
   </article>
   <article className="addon-card addon-activity"><h3><Clock size={19}/>{t('Recent field activity','खेतों में हाल के काम')}</h3>
    {activity.length?<ul>{activity.map(item=><li key={item.id}><span>{date(item.date)}</span><Link to={'/fields/'+item.fieldId+'/history'}><b>{item.fieldName}</b> · {item.title}</Link><small>{item.description}</small></li>)}</ul>:<p>{t('No field activity recorded yet.','अभी कोई गतिविधि दर्ज नहीं है।')}</p>}
   </article>
  </div>
  <div className="addon-secondary-grid addon-more-detail" hidden={!expanded}>
   <article className="addon-card addon-calendar"><h3><CalendarDays size={19}/>{t('Upcoming field visits','आने वाली खेत-जाँच')}</h3>
    {visits.length?<ul>{visits.map(visit=><li key={visit.fieldId+visit.id}><span className="addon-calendar-day">{date(visit.due)}</span><div><b>{visit.title}</b><small>{visit.fieldName} · {visit.status}</small></div><Link to={'/fields/'+visit.fieldId+'/overview?action=visit'} aria-label={t('Open field visit','जाँच खोलें')+': '+visit.fieldName}><ArrowRight size={17}/></Link></li>)}</ul>:<p>{t('No visits scheduled. Plan one from a field overview.','कोई जाँच तय नहीं है। खेत खोलकर तारीख़ तय करें।')}</p>}
   </article>
   <article className="addon-card addon-ai"><h3><Bot size={19}/>{t('Ask Gemini AI','Gemini AI से पूछें')}</h3><p>{t('Get a simple explanation of your field changes, vegetation or weather.','खेत, हरियाली और मौसम के बारे में आसान भाषा में पूछें।')}</p>
    <div className="addon-ai-prompts">{[
     [t('Why is greenness changing?','हरियाली क्यों बदल रही है?'),'greenness'],
     [t('Explain NDVI in simple terms','NDVI आसान शब्दों में बताएँ'),'ndvi'],
     [t('What should I inspect?','खेत में क्या जाँचें?'),'visit']
    ].map(([label,key])=><button key={key} type="button" onClick={()=>openAI(label)}>{label}<ArrowRight size={16}/></button>)}</div>
   </article>
  </div>
  <article className="addon-card addon-gallery addon-more-detail" hidden={!expanded}><div className="addon-gallery-title"><h3><Images size={19}/>{t('Crop photo gallery','फ़सल तस्वीरें')}</h3><Link to="/gallery">{t('See all photos','सभी तस्वीरें')} <ArrowRight size={16}/></Link></div><div className="addon-gallery-grid">{photoFields.map(field=><Link key={field.id} to={'/fields/'+field.id+'/overview'}><img src={cropPhoto(field.crop).src} alt={cropPhoto(field.crop).alt} loading="lazy"/><span>{field.name}</span></Link>)}{!photoFields.length&&<Link to="/gallery"><img src={cropPhotos.wheat.src} alt={cropPhotos.wheat.alt}/><span>{t('Explore crop images','फ़सल तस्वीरें देखें')}</span></Link>}</div></article>
  {expanded&&<p className="addon-footer">{t('Weather preview uses the most recent field with available data; map colours indicate visit priorities. All original dashboard sections remain unchanged.','मौसम उपलब्ध खेत की जानकारी है; नक्शे के रंग काम की प्राथमिकता दिखाते हैं। पुराने डैशबोर्ड में कोई बदलाव नहीं।')} {allWeather.length?t(`${allWeather.length} weather records across fields`,`खेतों में ${allWeather.length} मौसम रिकॉर्ड`):''}</p>}
 </section>;
}
