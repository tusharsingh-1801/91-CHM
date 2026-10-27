import {useEffect,useState} from 'react';
import {CloudRain,RefreshCw} from 'lucide-react';
import {loadForecast,type DatabaseField,type FieldForecast} from '../../lib/api';
import {usePreferences} from '../../lib/preferencesContext';
import './forecast-preview.css';

export function ForecastPreview({fields}:{fields:DatabaseField[]}){
 const {t,date}=usePreferences();
 const eligible=fields.filter(field=>field.latitude!=null&&field.longitude!=null);
 const [selected,setSelected]=useState('');
 const [reload,setReload]=useState(0);
 const [forecast,setForecast]=useState<FieldForecast|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const field=eligible.find(item=>item.id===selected)||eligible[0];
 useEffect(()=>{
  if(!field){setForecast(null);return;}
  let active=true;setBusy(true);setError('');setForecast(null);
  void loadForecast(field.id).then(data=>{if(active)setForecast(data);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Forecast unavailable');}).finally(()=>{if(active)setBusy(false);});
  return ()=>{active=false;};
 },[field?.id,reload]);
 const days=forecast?.days||[];
 const rainy=days.filter(day=>(day.precipitation_mm||0)>=5);
 return <article className="addon-card forecast-preview" aria-label={t('Next seven days weather forecast','अगले सात दिनों का मौसम पूर्वानुमान')}>
   <div className="forecast-preview-header"><div><h3><CloudRain size={20}/>{t('Next 7 days · Weather forecast','अगले 7 दिन · मौसम का पूर्वानुमान')}</h3><p>{t('Future predictions, separate from historical weather','आने वाले मौसम का अनुमान, पुराने मौसम रिकॉर्ड से अलग')}</p></div>
   <button type="button" disabled={busy||!field} onClick={()=>setReload(value=>value+1)} aria-label={t('Refresh forecast','मौसम पूर्वानुमान दोबारा देखें')}><RefreshCw size={17}/></button></div>
   {eligible.length>0&&<label className="forecast-field-label">{t('Choose field','खेत चुनें')}<select value={field?.id||''} onChange={event=>setSelected(event.target.value)}>{eligible.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
   {!eligible.length&&<p>{t('Add a field with map coordinates to see its forecast.','मौसम का अनुमान देखने के लिए नक्शे पर खेत जोड़ें।')}</p>}
   {busy&&<p role="status">{t('Checking upcoming weather…','आने वाला मौसम देख रहे हैं…')}</p>}
   {error&&<p className="forecast-error" role="alert">{error}</p>}
   {days.length>0&&<>
    <div className="forecast-days">{days.map(day=><div className="forecast-day" key={day.date}><time dateTime={day.date}>{date(day.date)}</time><strong>{day.max_c===null?'—':Math.round(day.max_c)+'°'} / {day.min_c===null?'—':Math.round(day.min_c)+'°'}</strong><span>{t('Rain','बारिश')}: {day.precipitation_mm===null?'—':day.precipitation_mm+' mm'}</span><span>{t('Chance','संभावना')}: {day.rain_probability_percent===null?'—':day.rain_probability_percent+'%'}</span><small>{t('Humidity','नमी')} {day.humidity_percent===null?'—':day.humidity_percent+'%'} · {t('Wind','हवा')} {day.wind_speed_kmh===null?'—':day.wind_speed_kmh+' km/h'}</small></div>)}</div>
    <p className="forecast-advice">{rainy.length?t(`Rainfall of at least 5 mm is forecast on ${rainy.length} day(s). Check drainage and local forecasts.`,`${rainy.length} दिन 5 मिमी या अधिक बारिश का अनुमान है। पानी की निकासी और स्थानीय मौसम जाँचें।`):t('No day with 5 mm or more rainfall is forecast. Check soil conditions before irrigation.','5 मिमी या अधिक बारिश का अनुमान नहीं है। सिंचाई से पहले मिट्टी की जाँच करें।')}</p>
    <p className="forecast-source">{forecast?.source} · {t('Retrieved','जानकारी मिली')} {forecast?.issued_at.slice(0,16).replace('T',' ')} UTC · {forecast?.source_url?<a href={forecast.source_url} target="_blank" rel="noreferrer">{t('Provider','स्रोत')}</a>:t('Illustrative data','नमूना डेटा')} · {t('Forecasts can change. Not a crop diagnosis.','पूर्वानुमान बदल सकते हैं। यह बीमारी की जाँच नहीं है।')}</p>
   </>}
  </article>;
}
