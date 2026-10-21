import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {growthStages,observationCategories,observationSeverities,type GrowthStage,type ObservationCategory,type ObservationSeverity} from '../../../shared/inspection';
import {loadResearchReviewQueue,submitExpertInspectionReview,type ExpertReviewInput,type ResearchReviewCase} from '../lib/api';
import {usePreferences} from '../lib/preferencesContext';
import './research-review.css';

const today=()=>new Date().toLocaleDateString('en-CA');
const categoryLabels:Record<ObservationCategory,[string,string]>={
 general_observation:['General observation','सामान्य जाँच'],visual_symptom:['Visible symptom','दिखने वाला लक्षण'],
 pest_observed:['Pest observed','कीट दिखाई दिया'],water_related:['Water-related','पानी से जुड़ी बात'],
 growth_stage:['Growth stage','विकास अवस्था'],other:['Other','अन्य'],unknown:['Unknown','पता नहीं'],
};
const stageLabels:Record<GrowthStage,[string,string]>={
 emergence:['Emergence','अंकुरण'],vegetative:['Vegetative','वृद्धि'],flowering:['Flowering','फूल आना'],
 fruiting:['Fruiting','फल/दाना बनना'],maturity:['Maturity','पकना'],harvested:['Harvested','कटाई'],unknown:['Unknown','पता नहीं'],
};
const severityLabels:Record<ObservationSeverity,[string,string]>={
 mild:['Mild','कम'],moderate:['Moderate','मध्यम'],severe:['Severe','अधिक'],unknown:['Unknown','पता नहीं'],not_applicable:['Not applicable','लागू नहीं'],
};
function isValue<T extends string>(values:readonly T[],value:string):value is T{return values.includes(value as T);}

function ReviewCard({item,onSubmit,busy,error}:{item:ResearchReviewCase;onSubmit:(input:ExpertReviewInput)=>void;busy:boolean;error:string|null}){
 const {t}=usePreferences();
 const [observedOn,setObservedOn]=useState(today);
 const [category,setCategory]=useState<ObservationCategory>('unknown');
 const [stage,setStage]=useState<GrowthStage>('unknown');
 const [severity,setSeverity]=useState<ObservationSeverity>('not_applicable');
 const [attested,setAttested]=useState(false);
 function submit(event:FormEvent){
  event.preventDefault();
  if(!attested||!growthStages.includes(stage)||!observationCategories.includes(category)||!observationSeverities.includes(severity))return;
  onSubmit({observed_on:observedOn,observation_category:category,growth_stage:stage,severity,attest_ground_visit:true});
 }
 const mapUrl=`https://www.openstreetmap.org/?mlat=${encodeURIComponent(item.latitude)}&mlon=${encodeURIComponent(item.longitude)}#map=17/${encodeURIComponent(item.latitude)}/${encodeURIComponent(item.longitude)}`;
 return <article className="research-review-card">
  <h3>{t('Consented field visit','अनुमति प्राप्त खेत-जाँच')} · {item.case_id.slice(0,8)}</h3>
  <p>{t('Reported observation date','दर्ज जाँच की तारीख़')}: <time dateTime={item.observed_on}>{item.observed_on}</time></p>
  <p><a href={mapUrl} target="_blank" rel="noopener noreferrer">{t('Open field location in OpenStreetMap ↗','OpenStreetMap में खेत का स्थान खोलें ↗')}</a></p>
  <p>{t('Record only what you observe during this visit. The grower’s report and photos are intentionally hidden to avoid bias.','इस खेत-जाँच में जो स्वयं देखें, वही दर्ज करें। पक्षपात कम करने के लिए किसान की रिपोर्ट और फ़ोटो नहीं दिखाई गई हैं।')}</p>
  <form onSubmit={submit}>
   <label>{t('Field visit date','खेत-जाँच की तारीख़')}<input type="date" required min={item.observed_on} max={today()} value={observedOn} onChange={event=>setObservedOn(event.target.value)}/></label>
   <label>{t('Observed category','देखा गया प्रकार')}<select value={category} onChange={event=>{if(isValue(observationCategories,event.target.value))setCategory(event.target.value);}}>{observationCategories.map(value=><option key={value} value={value}>{t(...categoryLabels[value])}</option>)}</select></label>
   <label>{t('Observed growth stage','देखी गई विकास अवस्था')}<select value={stage} onChange={event=>{if(isValue(growthStages,event.target.value))setStage(event.target.value);}}>{growthStages.map(value=><option key={value} value={value}>{t(...stageLabels[value])}</option>)}</select></label>
   <label>{t('Observed severity','देखी गई गंभीरता')}<select value={severity} onChange={event=>{if(isValue(observationSeverities,event.target.value))setSeverity(event.target.value);}}>{observationSeverities.map(value=><option key={value} value={value}>{t(...severityLabels[value])}</option>)}</select></label>
   <label><input type="checkbox" checked={attested} onChange={event=>setAttested(event.target.checked)}/>{t('I personally visited this field and these are my independent observations.','मैंने स्वयं इस खेत का दौरा किया है; ये मेरे स्वतंत्र अवलोकन हैं।')}</label>
   {error&&<p role="alert">{error}</p>}
   <button type="submit" disabled={busy||!attested}>{busy?t('Saving…','सेव हो रहा है…'):t('Save field-visit review','खेत-जाँच की समीक्षा सेव करें')}</button>
  </form>
 </article>;
}

export function ResearchReview(){
 const {t}=usePreferences();
 const [items,setItems]=useState<ResearchReviewCase[]>([]);
 const [loading,setLoading]=useState(true);
 const [loadError,setLoadError]=useState('');
 const [busyCase,setBusyCase]=useState<string|null>(null);
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [success,setSuccess]=useState('');
 const reload=useCallback(async()=>{
  setLoading(true);setLoadError('');
  try{setItems(await loadResearchReviewQueue());}catch(error){setLoadError(error instanceof Error?error.message:t('Could not load research reviews','शोध समीक्षाएँ नहीं मिलीं'));}
  finally{setLoading(false);}
 },[t]);
 useEffect(()=>{void reload();},[reload]);
 async function submit(item:ResearchReviewCase,input:ExpertReviewInput){
  setBusyCase(item.case_id);setErrors(current=>({...current,[item.case_id]:''}));setSuccess('');
  try{await submitExpertInspectionReview(item.case_id,input);setItems(current=>current.filter(value=>value.case_id!==item.case_id));setSuccess(t('Field-visit review saved in the audit history.','खेत-जाँच की समीक्षा ऑडिट इतिहास में सेव हुई।'));}
  catch(error){setErrors(current=>({...current,[item.case_id]:error instanceof Error?error.message:t('Review could not be saved','समीक्षा सेव नहीं हुई')}));}
  finally{setBusyCase(null);}
 }
 return <main className="research-review-page">
  <header><h1>{t('Research field reviews','शोध के लिए खेत-जाँच')}</h1><p>{t('This page is available only to assigned field reviewers. Reviews require an owner’s active, case-specific consent and an in-person field visit.','यह पेज केवल नियुक्त समीक्षकों के लिए है। समीक्षा के लिए खेत-मालिक की सक्रिय, रिकॉर्ड-विशिष्ट अनुमति और खेत पर जाकर जाँच आवश्यक है।')}</p></header>
  {loading&&<p role="status">{t('Loading consented field visits…','अनुमति प्राप्त खेत-जाँच ला रहे हैं…')}</p>}
  {loadError&&<p role="alert">{loadError} <button type="button" onClick={()=>void reload()}>{t('Retry','फिर कोशिश करें')}</button></p>}
  {success&&<p role="status">{success}</p>}
  {!loading&&!loadError&&!items.length&&<p>{t('No consented field visits are waiting for review.','समीक्षा के लिए कोई अनुमति प्राप्त खेत-जाँच उपलब्ध नहीं है।')}</p>}
  {items.map(item=><ReviewCard key={item.case_id} item={item} busy={busyCase===item.case_id} error={errors[item.case_id]||null} onSubmit={input=>void submit(item,input)}/>)}
 </main>;
}
