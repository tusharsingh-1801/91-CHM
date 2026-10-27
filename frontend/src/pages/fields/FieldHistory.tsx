import {MaizeLeafAnalysis} from '../../features/fields/MaizeLeafAnalysis';
import {OfflineNoteDraft} from '../../features/pwa/OfflineNoteDraft';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { loadFieldEvents, createFieldEvent, deleteFieldEvent, loadScouting, saveScouting, loadFieldTasks, updateFieldTask, setScoutingResearchConsent, type ScoutingCase, type DatabaseField, type FieldEvent, type FieldTask, type TaskState } from '../../lib/api';
import { usePreferences } from '../../lib/preferencesContext';
import {PhotoQualityPreview} from '../../features/fields/PhotoQualityPreview';
import {isScoutingDraftDate} from '../../features/fields/scoutingDraft';
import {OfflineDiaryDrafts} from '../../features/fields/OfflineDiaryDrafts';
import {growthStages, observationCategories, observationSeverities, type GrowthStage, type ObservationCategory, type ObservationSeverity} from '../../../../shared/inspection';

function isOneOf<T extends string>(values:readonly T[],value:unknown):value is T{
  return typeof value==='string'&&values.includes(value as T);
}

function EventNotes({event}:{event:FieldEvent}) {
  const {t}=usePreferences();
  let source:Record<string,unknown>|null=null;
  if(event.event_type==='dataset_import'&&event.notes){
    try { const parsed:unknown=JSON.parse(event.notes); if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))source=parsed as Record<string,unknown>; }
    catch { /* Preserve ordinary text notes from earlier imports. */ }
  }
  if(source) return <>
    <p>{t(`Historical boundary recorded in ${source.boundary_year || 'an unknown year'}. Current crop and dates are unverified.`, `${source.boundary_year || 'अज्ञात वर्ष'} की पुरानी सीमा। अभी की फ़सल और तारीख़ें सत्यापित नहीं हैं।`)}</p>
    {typeof source.source_url==='string'&&source.source_url.startsWith('https://')&&<a href={source.source_url} target="_blank" rel="noreferrer">{t('Dataset source and attribution ↗','स्रोत और श्रेय ↗')}</a>}
    <details><summary>{t('Source details','स्रोत की जानकारी')}</summary><p>{String(source.dataset||'')} · {String(source.license||'')}</p><p>{String(source.warning||'')}</p></details>
  </>;
  return <p>{event.notes || t('No notes provided','कोई नोट नहीं')}</p>;
}

function InspectionMetadata({cases,category,setCategory,stage,setStage,severity,setSeverity,t,date,consentSaving,consentError,onConsentChange,showResearchConsent}:{
  cases:ScoutingCase[];
  category:ObservationCategory;
  setCategory:(value:ObservationCategory)=>void;
  stage:GrowthStage;
  setStage:(value:GrowthStage)=>void;
  severity:ObservationSeverity;
  setSeverity:(value:ObservationSeverity)=>void;
  t:(english:string,hindi:string)=>string;
  date:(value:string)=>string;
  consentSaving:string|null;
  consentError:string|null;
  onConsentChange:(item:ScoutingCase)=>void;
  showResearchConsent:boolean;
}){
  const categoryText:Record<ObservationCategory,string>={
    general_observation:t('General observation','सामान्य जाँच'),
    visual_symptom:t('Visible symptom','दिखने वाला लक्षण'),
    pest_observed:t('Pest seen','कीट दिखाई दिया'),
    water_related:t('Water-related','पानी से जुड़ी बात'),
    growth_stage:t('Growth stage','विकास अवस्था'),
    other:t('Other','अन्य'),
    unknown:t('Not recorded','दर्ज नहीं'),
  };
  const stageText:Record<GrowthStage,string>={
    emergence:t('Emergence','अंकुरण'),
    vegetative:t('Vegetative','वृद्धि'),
    flowering:t('Flowering','फूल आना'),
    fruiting:t('Fruiting','फल/दाना बनना'),
    maturity:t('Maturity','पकना'),
    harvested:t('Harvested','कटाई'),
    unknown:t('Not recorded','दर्ज नहीं'),
  };
  const severityText:Record<ObservationSeverity,string>={
    mild:t('Mild','कम'),
    moderate:t('Moderate','मध्यम'),
    severe:t('Severe','अधिक'),
    unknown:t('Unknown','पता नहीं'),
    not_applicable:t('Not applicable','लागू नहीं'),
  };
  return <section className="inspection-metadata" aria-labelledby="inspection-metadata-title">
    <h3 id="inspection-metadata-title">{t('Structured inspection details','खेत की जाँच की जानकारी')}</h3>
    <p>{t('These self-reported details are saved with the next scouting photo. They are not expert-verified and do not diagnose crop problems.','यह जानकारी आपकी रिपोर्ट है और अगली जाँच की फ़ोटो के साथ सेव होगी। विशेषज्ञ ने इसे सत्यापित नहीं किया है और इससे बीमारी का पता नहीं चलता।')}</p>
    {showResearchConsent&&cases.length>0&&<p className="quiet">{t('Research participation is optional. If enabled, an authorized reviewer can see this field location and observation date for an independent field visit. Your report labels, photos, free-text notes and account identity are not shown in the review queue. Withdrawal stops future review access; it does not erase audit history.','शोध में भाग लेना वैकल्पिक है। अनुमति देने पर अधिकृत समीक्षक स्वतंत्र खेत-जाँच के लिए खेत का स्थान और जाँच की तारीख़ देख सकता है। आपकी रिपोर्ट की श्रेणियाँ, फ़ोटो, लिखे हुए नोट और खाते की पहचान समीक्षा सूची में नहीं दिखाई जाती। अनुमति वापस लेने पर आगे की समीक्षा रुकती है; ऑडिट इतिहास नहीं मिटता।')}</p>}
    <label>{t('Observation category','जाँच का प्रकार')}<select value={category} onChange={event=>{if(isOneOf(observationCategories,event.target.value))setCategory(event.target.value);}}>
      {observationCategories.map(value=><option key={value} value={value}>{categoryText[value]}</option>)}
    </select></label>
    <label>{t('Observed growth stage','देखी गई विकास अवस्था')}<select value={stage} onChange={event=>{if(isOneOf(growthStages,event.target.value))setStage(event.target.value);}}>
      {growthStages.map(value=><option key={value} value={value}>{stageText[value]}</option>)}
    </select></label>
    <label>{t('Reported severity','बताई गई गंभीरता')}<select value={severity} onChange={event=>{if(isOneOf(observationSeverities,event.target.value))setSeverity(event.target.value);}}>
      {observationSeverities.map(value=><option key={value} value={value}>{severityText[value]}</option>)}
    </select></label>
    {cases.map(item=><article className="inspection-summary" key={item.id}>
      <h4>{t('Inspection record','जाँच रिकॉर्ड')} · {date(item.observed_on)}</h4>
      <p>{t('Category','प्रकार')}: {categoryText[item.observation_category] ?? categoryText.unknown} · {t('Growth stage','विकास अवस्था')}: {stageText[item.growth_stage] ?? stageText.unknown} · {t('Severity','गंभीरता')}: {severityText[item.severity] ?? severityText.unknown}</p>
      <p className="quiet">{item.verification_status==='expert_verified'?t('Expert-reviewed observation','विशेषज्ञ द्वारा जाँची गई जानकारी'):t('Owner-reported; not expert-verified.','खेत के मालिक की रिपोर्ट; विशेषज्ञ द्वारा सत्यापित नहीं।')}</p>
      {showResearchConsent&&<div>
        <button type="button" className="text-button" disabled={consentSaving===item.id} onClick={()=>onConsentChange(item)}>
          {consentSaving===item.id?t('Saving consent…','अनुमति सेव हो रही है…'):item.research_consent?t('Withdraw research consent','शोध की अनुमति वापस लें'):t('Optionally allow a research field visit','शोध के लिए खेत-जाँच की वैकल्पिक अनुमति दें')}
        </button>
        {consentError===item.id&&<p role="alert">{t('Consent could not be updated. Please retry.','अनुमति अपडेट नहीं हुई। फिर कोशिश करें।')}</p>}
      </div>}
    </article>)}
  </section>;
}

export function FieldHistory() {
  const { field } = useOutletContext<{field:DatabaseField}>();
  const { t, date } = usePreferences();
  const [params] = useSearchParams();
  const [events, setEvents] = useState<FieldEvent[]>([]);
  const [cases, setCases] = useState<ScoutingCase[]>([]);
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [eventError, setEventError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [type, setType] = useState('planting');
  const [eventDate, setEventDate] = useState('');
  const [notes, setNotes] = useState('');
  const [reload, setReload] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [photoDate, setPhotoDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [symptoms, setSymptoms] = useState('');
  const [photoNotes, setPhotoNotes] = useState('');
  const [observationCategory, setObservationCategory] = useState<ObservationCategory>('unknown');
  const [growthStage, setGrowthStage] = useState<GrowthStage>('unknown');
  const [severity, setSeverity] = useState<ObservationSeverity>('not_applicable');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [consentSaving,setConsentSaving]=useState<string|null>(null);
  const [consentError,setConsentError]=useState<string|null>(null);
  const [key, setKey] = useState<string>(() => crypto.randomUUID());
  const [draftReadyField, setDraftReadyField] = useState<string | null>(null);
  const activeFieldId = useRef(field.id);
  const fieldVisit = useRef(0);
  if (activeFieldId.current !== field.id) {
    activeFieldId.current = field.id;
    fieldVisit.current += 1;
  }
  // The layout unmounts this page during field navigation. Late responses must not clear a restored draft.
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Keep text-only scouting drafts for this tab. Photos are never stored in browser storage.
  useEffect(() => {
    // A routed field switch can reuse this component. Never carry one field's
    // scouting inputs or submission key into a different field.
    setDraftReadyField(null);
    setPhoto(null);
    setPreview('');
    setPhotoError(false);
    setPhotoSaved(false);
    setPhotoSaving(false);
    setSaving(false);
    setDeleting(null);
    setConsentSaving(null);
    setConsentError(null);
    setEventError(false);
    setEventDate('');
    setNotes('');
    setPhotoDate(new Date().toLocaleDateString('en-CA'));
    setSymptoms('');
    setPhotoNotes('');
    setObservationCategory('unknown');
    setGrowthStage('unknown');
    setSeverity('not_applicable');
    setKey(crypto.randomUUID());
    const storageKey = `terrascope:scouting-draft:${field.id}`;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const draft:unknown = JSON.parse(raw);
      if (!draft || typeof draft !== 'object') return;
      const data = draft as Record<string,unknown>;
      if (isScoutingDraftDate(data.observed_on)) setPhotoDate(data.observed_on);
      if (typeof data.symptoms === 'string') setSymptoms(data.symptoms.slice(0,4000));
      if (typeof data.notes === 'string') setPhotoNotes(data.notes.slice(0,4000));
      if (isOneOf(observationCategories,data.observation_category)) setObservationCategory(data.observation_category);
      if (isOneOf(growthStages,data.growth_stage)) setGrowthStage(data.growth_stage);
      if (isOneOf(observationSeverities,data.severity)) setSeverity(data.severity);
      if (typeof data.client_key === 'string' && /^[a-f0-9-]{36}$/i.test(data.client_key)) setKey(data.client_key);
    } catch { /* Storage may be disabled; upload remains usable. */ }
    finally { setDraftReadyField(field.id); }
  }, [field.id]);
  useEffect(() => {
    const storageKey = `terrascope:scouting-draft:${field.id}`;
    if (draftReadyField !== field.id) return;
    try {
      if (symptoms || photoNotes || photo || observationCategory!=='unknown' || growthStage!=='unknown' || severity!=='not_applicable') sessionStorage.setItem(storageKey,JSON.stringify({observed_on:photoDate,symptoms,notes:photoNotes,observation_category:observationCategory,growth_stage:growthStage,severity,client_key:key}));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Private browsing or storage quotas must not prevent uploading. */ }
  }, [field.id,photoDate,symptoms,photoNotes,photo,observationCategory,growthStage,severity,key,draftReadyField]);
  const eventTitle = (value:string) => ({planting:t('Planting','बुवाई'),fertilizer:t('Fertilizer Application','खाद डालना'),irrigation:t('Irrigation','सिंचाई'),pesticide:t('Pesticide Application','कीटनाशक डालना'),scouting:t('Scouting / Observation','खेत की जाँच'),harvest:t('Harvest','कटाई'),other:t('Other','अन्य'),dataset_import:t('Public boundary imported','सार्वजनिक सीमा जोड़ी गई')} as Record<string,string>)[value] || value;
  useEffect(() => {
    // On field navigation, do not display another field's cached diary while loading.
    setLoading(true);
    setLoadError(false);
    setEvents([]);
    setCases([]);
    setTasks([]);
    let stopped = false;
    void Promise.allSettled([loadFieldEvents(field.id),loadScouting(field.id),loadFieldTasks(field.id)]).then(([diary,scouting,visits]) => {
      if (stopped) return;
      if (diary.status === 'fulfilled') setEvents(diary.value);
      if (scouting.status === 'fulfilled') setCases(scouting.value.cases);
      if (visits.status === 'fulfilled') setTasks(visits.value);
      setLoadError([diary,scouting,visits].some(item => item.status === 'rejected')); setLoading(false);
    });
    return () => { stopped = true; };
  }, [field.id,reload]);
  useEffect(() => { if (!loading && params.get('photo') === '1') { document.getElementById('scouting-title')?.scrollIntoView(); document.getElementById('scouting-photo')?.focus({preventScroll:true}); } }, [loading,params]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function addEvent(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    const submittedFieldId = field.id;
    const submittedVisit = fieldVisit.current;
    const stillOnSubmittedVisit = () => mounted.current && activeFieldId.current === submittedFieldId && fieldVisit.current === submittedVisit;
    setSaving(true); setEventError(false);
    try {
      const saved = await createFieldEvent(submittedFieldId,type,eventDate,notes);
      if (!stillOnSubmittedVisit()) return;
      setEvents(current => [saved,...current].sort((a,b) => b.event_date.localeCompare(a.event_date)));
      setNotes(''); setEventDate('');
    } catch { if (stillOnSubmittedVisit()) setEventError(true); }
    finally { if (stillOnSubmittedVisit()) setSaving(false); }
  }
  async function addPhoto(event: FormEvent) {
    event.preventDefault(); if (!photo || photoSaving) return;
    const submittedFieldId = field.id;
    const submittedVisit = fieldVisit.current;
    const stillOnSubmittedVisit = () => mounted.current && activeFieldId.current === submittedFieldId && fieldVisit.current === submittedVisit;
    setPhotoError(false); setPhotoSaved(false);
    if (photo.size > 5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(photo.type)) { setPhotoError(true); return; }
    setPhotoSaving(true);
    try {
      const image = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read image')); reader.onerror = () => reject(new Error('Unable to read image')); reader.readAsDataURL(photo); });
      // FileReader is asynchronous: navigation may happen before the request starts.
      // Do not submit an abandoned field visit after the user has switched fields.
      if (!stillOnSubmittedVisit()) return;
      const saved = await saveScouting(submittedFieldId,{client_key:key,observed_on:photoDate,crop:field.crop && field.crop !== 'Unknown' ? field.crop : undefined,symptoms,notes:photoNotes,image,observation_category:observationCategory,growth_stage:growthStage,severity});
      if (!stillOnSubmittedVisit()) return;
      setCases(current => [saved,...current.filter(item => item.id !== saved.id)]); setPhoto(null); setPreview(''); setSymptoms(''); setPhotoNotes(''); setObservationCategory('unknown'); setGrowthStage('unknown'); setSeverity('not_applicable'); setKey(crypto.randomUUID()); try { sessionStorage.removeItem(`terrascope:scouting-draft:${field.id}`); } catch { /* Optional storage. */ } setPhotoSaved(true);
      const input = document.getElementById('scouting-photo') as HTMLInputElement | null; if (input) input.value = '';
      try { const refreshedTasks = await loadFieldTasks(submittedFieldId); if (stillOnSubmittedVisit()) setTasks(refreshedTasks); } catch { if (stillOnSubmittedVisit()) setLoadError(true); }
    } catch { if (stillOnSubmittedVisit()) setPhotoError(true); } finally { if (stillOnSubmittedVisit()) setPhotoSaving(false); }
  }
  async function changeResearchConsent(item:ScoutingCase) {
    if(consentSaving)return;
    const submittedFieldId=field.id;
    const submittedVisit=fieldVisit.current;
    const active=()=>mounted.current&&activeFieldId.current===submittedFieldId&&fieldVisit.current===submittedVisit;
    setConsentSaving(item.id);setConsentError(null);
    try{
      const consented=await setScoutingResearchConsent(submittedFieldId,item.id,!item.research_consent);
      if(active())setCases(current=>current.map(value=>value.id===item.id?{...value,research_consent:consented}:value));
    }catch{if(active())setConsentError(item.id);}
    finally{if(active())setConsentSaving(null);}
  }
  if (loading) return <div className="diary-layout" role="status">{t('Loading field diary…','खेत की डायरी ला रहे हैं…')}</div>;
  return <div className="diary-layout"><div className="content-heading"><h2>{t('Field diary','खेत की डायरी')}</h2><Link to={`/fields/${field.id}/overview?action=visit`}>{t('Plan a field visit','खेत की जाँच तय करें')} →</Link></div>
    {loadError && <p className="error-notice" role="alert">{t('Some diary records could not be loaded.','डायरी की कुछ जानकारी नहीं मिली।')} <button onClick={() => { setLoading(true); setReload(value => value+1); }}>{t('Retry loading history','फिर कोशिश करें')}</button></p>}
    <OfflineDiaryDrafts fieldId={field.id} onSynced={saved=>setEvents(current=>[saved,...current.filter(item=>item.id!==saved.id)].sort((a,b)=>b.event_date.localeCompare(a.event_date)))}/>
    <section className="diary-form"><h3>{t('Log New Event','खेत का काम दर्ज करें')}</h3><form onSubmit={addEvent}><label>{t('Event Type','किस तरह का काम')}<select value={type} onChange={event => setType(event.target.value)}>{['planting','fertilizer','irrigation','pesticide','scouting','harvest','other'].map(value => <option key={value} value={value}>{eventTitle(value)}</option>)}</select></label><label>{t('Date','तारीख़')}<input type="date" required value={eventDate} onChange={event => setEventDate(event.target.value)}/></label><label>{t('Notes (Optional)','नोट (ज़रूरी नहीं)')}<textarea value={notes} maxLength={4000} onChange={event => setNotes(event.target.value)} rows={3}/></label>{eventError && <p role="alert">{t('Event could not be saved. Your entries are still here; please retry.','काम सेव नहीं हुआ। जानकारी यहीं है; फिर कोशिश करें।')}</p>}<button type="submit" className="primary-action" disabled={saving}>{saving ? t('Saving…','सेव कर रहे हैं…') : t('Save Event','काम सेव करें')}</button></form></section>
    <section aria-labelledby="events-title"><h3 id="events-title">{t('Recorded field work','दर्ज किए गए काम')}</h3>{!events.length && <p>{t('No events recorded for this field.','इस खेत का कोई काम अभी दर्ज नहीं है।')}</p>}{events.map(item => <article className="history-event" key={item.id}><div><strong>{eventTitle(item.event_type)}</strong><EventNotes event={item}/><small>{date(item.event_date)}</small></div><button type="button" className="text-button" disabled={deleting === item.id} onClick={async () => { if (!window.confirm(t('Delete this field event?','यह काम हटाएँ?'))) return; const submittedFieldId=field.id; const submittedVisit=fieldVisit.current; const active=()=>mounted.current&&activeFieldId.current===submittedFieldId&&fieldVisit.current===submittedVisit; setDeleting(item.id); try { await deleteFieldEvent(submittedFieldId,item.id); if(active()) setEvents(current => current.filter(value => value.id !== item.id)); } catch { if(active()) setLoadError(true); } finally { if(active()) setDeleting(null); } }}>{deleting === item.id ? t('Deleting…','हटा रहे हैं…') : t('Delete','हटाएँ')}</button></article>)}</section>
    <InspectionMetadata cases={cases} category={observationCategory} setCategory={setObservationCategory} stage={growthStage} setStage={setGrowthStage} severity={severity} setSeverity={setSeverity} t={t} date={date} consentSaving={consentSaving} consentError={consentError} onConsentChange={item=>void changeResearchConsent(item)} showResearchConsent/>
    <section className="scouting-panel" aria-labelledby="scouting-title"><h2 id="scouting-title" tabIndex={-1}>{t('Photo scouting','फ़ोटो और खेत की जाँच')}</h2><p>{t('Photograph what you see and add a note. Photos are saved to this field; automatic disease diagnosis is not available.','जो दिखे उसकी फ़ोटो और नोट जोड़ें। फ़ोटो इस खेत में सेव होगी; बीमारी की अपने आप पहचान अभी उपलब्ध नहीं है।')}</p><form onSubmit={addPhoto}><label>{t('Observation date','जाँच की तारीख़')}<input aria-label={t('Scouting observation date','खेत की जाँच की तारीख़')} type="date" required max={new Date().toLocaleDateString('en-CA')} value={photoDate} onChange={event => setPhotoDate(event.target.value)}/></label><label>{t('Symptoms','क्या दिख रहा है')}<textarea value={symptoms} maxLength={4000} onChange={event => setSymptoms(event.target.value)} rows={2}/></label><label>{t('Notes','नोट')}<textarea value={photoNotes} maxLength={4000} onChange={event => setPhotoNotes(event.target.value)} rows={3}/></label><label>{t('Crop photo','फ़सल की फ़ोटो')}<input id="scouting-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required onChange={event => { const image = event.target.files?.[0] ?? null; setPhoto(image); setPreview(image ? URL.createObjectURL(image) : ''); setPhotoError(false); }}/></label><small>{t('JPEG, PNG or WebP up to 5 MB. Take a clear, close photo in daylight.','JPEG, PNG या WebP, 5 MB तक। दिन की रोशनी में पास से साफ़ फ़ोटो लें।')}</small>{preview && <img className="scouting-photo-preview" src={preview} alt={t('Selected crop photo preview','चुनी फ़सल की फ़ोटो का पूर्वावलोकन')}/>}<PhotoQualityPreview fieldId={field.id} file={photo}/>{field.crop?.toLowerCase().includes('maize') || field.crop?.toLowerCase().includes('corn') ? <MaizeLeafAnalysis key={field.id} fieldId={field.id}/> : null}{photoError && <p role="alert">{t('Photo could not be saved. Your note and selected photo are still here; check the date or connection, then retry.','फ़ोटो सेव नहीं हुई। आपका नोट और चुनी हुई फ़ोटो यहीं हैं; तारीख़ या इंटरनेट जाँचकर दोबारा कोशिश करें।')}</p>}<button type="submit" className="primary-action" disabled={photoSaving || !photo}>{photoSaving ? t('Saving photo and field note…','फ़ोटो और नोट सेव कर रहे हैं…') : t('Save scouting note','फ़ोटो और नोट सेव करें')}</button></form>{photoSaved && <p className="success-notice" role="status">{t('Photo and field note saved.','फ़ोटो और नोट सेव हो गए।')}</p>}
      <p className="quiet">{t('Diagnosis unavailable: no licensed, validated provider is configured. Photo quality review is not a crop diagnosis.','बीमारी की पहचान उपलब्ध नहीं है: कोई सत्यापित सेवा जुड़ी नहीं है। फ़ोटो की गुणवत्ता जाँचना बीमारी की पहचान नहीं है।')}</p>
      {!cases.length && <p>{t('No photos or scouting notes recorded for this field.','इस खेत की कोई फ़ोटो या जाँच का नोट नहीं है।')}</p>}{cases.map(item => <article className="scouting-case" key={item.id}><h3>{t('Field note','खेत का नोट')} · {date(item.observed_on)}</h3>{item.symptoms && <p>{item.symptoms}</p>}{item.notes && <p>{item.notes}</p>}{item.photos?.map(image => <div key={image.id}><img className="scouting-photo-preview" loading="lazy" alt={t('Saved crop scouting photo','सेव की हुई फ़सल की फ़ोटो')} src={`/api/fields/${field.id}/scouting/${item.id}/photos/${image.id}`} /><details><summary>{t('Photo quality','फ़ोटो की गुणवत्ता')}</summary>{image.quality}</details></div>)}<button className="text-button" disabled={deleting === item.id} onClick={async () => { if (!window.confirm(t('Delete this photo note and its follow-up task?','यह फ़ोटो नोट और उससे जुड़ा काम हटाएँ?'))) return; const submittedFieldId=field.id; const submittedVisit=fieldVisit.current; const active=()=>mounted.current&&activeFieldId.current===submittedFieldId&&fieldVisit.current===submittedVisit; setDeleting(item.id); try { const response = await fetch(`/api/fields/${submittedFieldId}/scouting/${item.id}`,{method:'DELETE'}); if (!response.ok) throw new Error('Delete failed'); if(!active()) return; setCases(current => current.filter(value => value.id !== item.id)); const updatedTasks=await loadFieldTasks(submittedFieldId); if(active()) setTasks(updatedTasks); } catch { if(active()) setLoadError(true); } finally { if(active()) setDeleting(null); } }}>{t('Delete photo note','फ़ोटो नोट हटाएँ')}</button></article>)}
    </section>
    <section aria-labelledby="tasks-title"><h2 id="tasks-title">{t('Follow-up tasks','आगे के काम')}</h2>{!tasks.length && <p>{t('No follow-up tasks are open for this field.','इस खेत का कोई आगे का काम नहीं है।')}</p>}{tasks.map(item => <article className="task-row" key={item.id}><div><strong>{item.title}</strong><p>{item.due_on ? date(item.due_on) : t('No date chosen','तारीख़ तय नहीं')}</p></div><label>{t('State','स्थिति')}<select aria-label={`${t('Task state for','काम की स्थिति:')} ${item.title}`} value={item.status} disabled={deleting === item.id} onChange={async event => { const status = event.target.value as TaskState; const submittedFieldId=field.id; const submittedVisit=fieldVisit.current; const active=()=>mounted.current&&activeFieldId.current===submittedFieldId&&fieldVisit.current===submittedVisit; setDeleting(item.id); try { await updateFieldTask(submittedFieldId,item.id,status); if(active()) setTasks(current => current.map(value => value.id === item.id ? {...value,status} : value)); } catch { if(active()) setLoadError(true); } finally { if(active()) setDeleting(null); } }}>{(['open','acknowledged','action_taken','resolved'] as const).map(value => <option key={value} value={value}>{{open:t('Open','खुला'),acknowledged:t('Acknowledged','देख लिया'),action_taken:t('Action taken','कार्रवाई की'),resolved:t('Resolved','बंद')}[value]}</option>)}</select></label></article>)}<p className="quiet">{t('Closing a task does not confirm crop recovery.','काम बंद करने से फ़सल के ठीक होने की पुष्टि नहीं होती।')}</p></section>
    <OfflineNoteDraft key={field.id} field={field} onSynced={saved=>{if(mounted.current&&activeFieldId.current===field.id)setEvents(current=>[saved,...current.filter(item=>item.id!==saved.id)].sort((a,b)=>b.event_date.localeCompare(a.event_date)));}}/>
  </div>;
}
