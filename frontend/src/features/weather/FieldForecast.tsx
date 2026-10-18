import {useEffect,useState} from 'react';
import {CloudSun,Droplets,Wind} from 'lucide-react';
import {usePreferences} from '../../lib/preferencesContext';
import type {DatabaseField} from '../../lib/api';
type Daily={time:string[];temperature_2m_max:number[];temperature_2m_min:number[];precipitation_sum:number[];precipitation_probability_max:number[];relative_humidity_2m_mean:number[]};
type Forecast={daily:Daily;generationtime_ms?:number};
export function FieldForecast({field}:{field:DatabaseField}){
 const {t,date}=usePreferences();
 const [data,setData]=useState<Forecast|null>(null);
 const [error,setError]=useState('');
 const [reload,setReload]=useState(0);
 const lat=Number(field.latitude),lon=Number(field.longitude);
 const hasCoords=field.latitude!=null&&field.longitude!=null&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 useEffect(()=>{
  if(!hasCoords)return;
  const controller=new AbortController();
  setData(null);setError('');
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:String(lat),longitude:String(lon),daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean',timezone:'auto',forecast_days:'7'}).toString();
  void fetch(url,{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('Forecast service unavailable');return response.json() as Promise<Forecast>})
   .then(value=>{if(!controller.signal.aborted){if(!Array.isArray(value.daily?.time)||value.daily.time.length<1)throw Error('Missing weather forecast');setData(value);}})
   .catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Forecast unavailable');});
  return ()=>controller.abort();
 },[lat,lon,hasCoords,reload]);
 return <section className="advanced-weather" aria-label={t('Seven-day forecast','सात दिन का मौसम पूर्वानुमान')}>
  <h2><CloudSun size={21} aria-hidden="true"/>{t('Next 7 days: weather forecast','अगले 7 दिन: मौसम पूर्वानुमान')}</h2>
  <p>{t('Location-based forecast supplied by Open-Meteo. This is a prediction, not measured historical weather or an irrigation prescription.','Open-Meteo से स्थान आधारित अनुमान। यह पिछले मौसम का रिकॉर्ड या सिंचाई की निश्चित सलाह नहीं है।')}</p>
  {!hasCoords?<p>{t('Add field coordinates to enable forecast.','पूर्वानुमान के लिए खेत की लोकेशन जोड़ें।')}</p>:error?<p role="alert">{error} <button onClick={()=>setReload(v=>v+1)}>{t('Retry forecast','दोबारा मौसम देखें')}</button></p>:!data?<p>{t('Loading forecast…','मौसम पूर्वानुमान ला रहे हैं…')}</p>:
  <div className="advanced-weather-grid">{data.daily.time.slice(0,7).map((day,i)=><article key={day}><strong>{date(day)}</strong>
   <div><CloudSun size={16}/><b>{Math.round(data.daily.temperature_2m_max[i])}° / {Math.round(data.daily.temperature_2m_min[i])}°C</b></div>
   <small><Droplets size={13}/>{data.daily.precipitation_sum[i]} mm · {data.daily.precipitation_probability_max[i]}% {t('rain chance','बारिश की संभावना')}</small>
   <small><Wind size={13}/>{data.daily.relative_humidity_2m_mean[i]}% {t('humidity','नमी')}</small>
  </article>)}</div>}
  <small>{t('Provider: Open-Meteo · Forecast may change as new information arrives.','स्रोत: Open-Meteo · अनुमान बदल सकता है।')}</small>
 </section>;
}
