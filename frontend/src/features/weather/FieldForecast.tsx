import {useEffect,useState,lazy,Suspense} from 'react';
import {usePreferences} from '../../lib/preferencesContext';
import type {DatabaseField} from '../../lib/api';
import type {Forecast} from '../../../../shared/forecast';
import '../platform.css';
const ForecastCharts=lazy(()=>import('./ForecastCharts').then(module=>({default:module.ForecastCharts})));
export function FieldForecast({field,compact=false}:{field:DatabaseField;compact?:boolean}){
 const {t,date}=usePreferences();const [now,setNow]=useState(Date.now);const [data,setData]=useState<Forecast|null>(null);const [error,setError]=useState('');const [reload,setReload]=useState(0);
 const located=field.latitude!=null&&field.longitude!=null;
 useEffect(()=>{
  if(!located)return;const controller=new AbortController();let timedOut=false;
  const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},35000);
  setError('');
  void fetch(`/api/fields/${field.id}/forecast`,{signal:controller.signal}).then(async response=>{
   const value=await response.json().catch(()=>({})) as Partial<Forecast>&{error?:string};
   if(!response.ok)throw new Error(value.error||'Forecast is temporarily unavailable.');
   if(!Array.isArray(value.days)||value.days.length!==7)throw new Error('The forecast service returned incomplete data. Please retry.');
   return value as Forecast;
  }).then(value=>{if(!controller.signal.aborted){setNow(Date.now());setData(value);}}).catch(caught=>{
   if(!controller.signal.aborted||timedOut)setError(timedOut?'Forecast request timed out. Check your connection and retry.':caught instanceof Error?caught.message:'Forecast is temporarily unavailable.');
  }).finally(()=>window.clearTimeout(timeout));
  return()=>{window.clearTimeout(timeout);controller.abort();};
 },[field.id,field.latitude,field.longitude,located,reload]);
 useEffect(()=>{if(!data)return;const timer=window.setTimeout(()=>{setNow(Date.now());setReload(value=>value+1);},Math.max(1000,Date.parse(data.expiresAt)-Date.now()));return()=>window.clearTimeout(timer);},[data]);
 const usable=data&&Date.parse(data.expiresAt)>now;
 return <section className="platform-panel forecast-panel" aria-label={t('Seven-day forecast','सात दिन का मौसम पूर्वानुमान')}><h3>{t('Next 7 days · Weather forecast','अगले 7 दिन · मौसम पूर्वानुमान')}</h3><p>{field.name} · {t('Forecasts are predictions; historical NASA POWER records remain separate.','पूर्वानुमान अनुमान हैं; NASA POWER के पुराने रिकॉर्ड अलग हैं।')}</p>
  {!located?<p>{t('Add field coordinates to see its forecast.','पूर्वानुमान के लिए खेत की लोकेशन जोड़ें।')}</p>:error?<p aria-live="polite" role="alert">{error} <button type="button" onClick={()=>setReload(value=>value+1)}>{t('Retry forecast','पूर्वानुमान फिर देखें')}</button></p>:!data?<p aria-live="polite">{t('Loading forecast…','पूर्वानुमान लोड हो रहा है…')}</p>:<>
   {!usable&&<p aria-live="polite">{t('This forecast has expired; refresh before using it.','यह पूर्वानुमान पुराना है; इस्तेमाल से पहले अपडेट करें।')}</p>}
   {data.current&&<p>{t('Current modeled weather','मॉडल के अनुसार अभी का मौसम')}: {data.current.temperatureC??'—'}°C · {t('Humidity','नमी')} {data.current.humidity??'—'}% · {t('Wind','हवा')} {data.current.windKph??'—'} km/h</p>}
   {usable&&data.days.some(day=>(day.rainMm??0)>=20)&&<p className="forecast-insight">{t('Heavy rain is forecast on at least one day. Check field drainage and review updates.','कम से कम एक दिन तेज़ बारिश का अनुमान है। जल निकासी जाँचें और अपडेट देखें।')}</p>}
   {usable&&data.days.some(day=>(day.maxC??0)>=35)&&<p className="forecast-insight">{t('A high-temperature day is forecast. Check crops and water availability in person.','गर्मी वाले दिन का अनुमान है। खेत में फ़सल और पानी की उपलब्धता जाँचें।')}</p>}
   <div className="forecast-days">{data.days.map(day=><article key={day.date}><strong>{date(day.date)}</strong><b>{day.minC??'—'}–{day.maxC??'—'}°C</b><span>{day.rainMm??'—'} mm · {day.rainChance??'—'}% {t('rain chance','बारिश की संभावना')}</span><span>{t('Humidity','नमी')}: {day.humidity??'—'}%</span><span>{t('Wind','हवा')}: {day.windKph??'—'} km/h</span></article>)}</div>
   {!compact&&<details><summary>{t('Temperature and rainfall charts','तापमान और बारिश के ग्राफ़')}</summary><Suspense fallback={<p aria-live="polite">{t('Loading charts…','ग्राफ़ लोड हो रहे हैं…')}</p>}><ForecastCharts forecast={data}/></Suspense></details>}
   <p><small>{t('Retrieved','जानकारी मिली')}: {new Date(data.retrievedAt).toLocaleString()} · {data.timezone}. {t('Provider issue time is not supplied by this API.','यह API पूर्वानुमान जारी होने का समय नहीं देती।')}</small></p><a href={data.sourceUrl||undefined} target="_blank" rel="noreferrer">{data.source}</a> · <button type="button" onClick={()=>setReload(value=>value+1)}>{t('Refresh forecast','पूर्वानुमान अपडेट करें')}</button>
  </>}
 </section>;
}
