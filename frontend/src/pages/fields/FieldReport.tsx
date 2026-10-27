import {ReportAppendix} from '../../features/fields/ReportAppendix';
import { useEffect, useState,useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { loadFields, loadNdvi, loadFieldEvents, loadScouting, type DatabaseField, type VegetationIndexObservation, type FieldEvent, type ScoutingCase } from '../../lib/api';
import { usePreferences } from '../../lib/preferencesContext';
import { fieldCopy } from '../../lib/fieldCopy';
import { toCsv } from '../../../../shared/exports';
import { VegetationChart } from '../../features/fields/VegetationChart';

function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Reports() {
  const { t, area } = usePreferences();
  const [fields, setFields] = useState<DatabaseField[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => { let stopped = false; void loadFields().then(value => { if (!stopped) { setFields(value); setError(false); } }).catch(() => { if (!stopped) setError(true); }); return () => { stopped = true; }; }, [reload]);
  return <main className="dashboard-shell"><Link to="/" className="back-link">← {t('My fields', 'मेरे खेत')}</Link><h1>{t('Field reports', 'खेत की रिपोर्ट')}</h1><p>{t('Choose a field to print a report or download its readings and boundary.', 'रिपोर्ट प्रिंट करने या रीडिंग और सीमा डाउनलोड करने के लिए खेत चुनें।')}</p>
    {error ? <p role="alert">{t('Fields could not be loaded.', 'खेतों की जानकारी नहीं मिली।')} <button onClick={() => { setError(false); setFields(null); setReload(value => value+1); }}>{t('Retry', 'फिर कोशिश करें')}</button></p> : fields == null ? <p role="status">{t('Loading fields…', 'खेतों की जानकारी ला रहे हैं…')}</p> : fields.length ? <div className="report-list">{fields.map(field => <Link key={field.id} to={`/fields/${field.id}/report`}><strong>{field.name}</strong><span>{area(field.area_hectares)}</span><span>{t('Open report →', 'रिपोर्ट खोलें →')}</span></Link>)}</div> : <p>{t('Add a field first to create a report.', 'रिपोर्ट बनाने के लिए पहले खेत जोड़ें।')}</p>}
  </main>;
}
export function FieldReport() {
  const { field } = useOutletContext<{ field: DatabaseField }>();
  const { t, language, date, area } = usePreferences();
  const [extrasReady,setExtrasReady]=useState(false);
  const markExtrasReady=useCallback(()=>setExtrasReady(true),[]);
  const [observations, setObservations] = useState<VegetationIndexObservation[]>([]);
  const [events, setEvents] = useState<FieldEvent[]>([]);
  const [inspections, setInspections] = useState<ScoutingCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    let stopped = false;
    void Promise.all([loadNdvi(field.id), loadFieldEvents(field.id), loadScouting(field.id)]).then(([readings, diary, scouting]) => { if (!stopped) { setObservations(readings); setEvents(diary); setInspections(scouting.cases); setError(false); } }).catch(() => { if (!stopped) setError(true); }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [field.id, reload]);
  const invalidRange = Boolean(from && to && from > to);
  const inRange = (value: string) => (!from || value.slice(0,10) >= from) && (!to || value.slice(0,10) <= to);
  const selected = observations.filter(item => item.boundary_version === (field.boundary_version ?? 1) && inRange(item.observed_on));
  const diary = events.filter(item => inRange(item.event_date));
  const selectedInspections = inspections.filter(item => inRange(item.observed_on));
  const copy = fieldCopy(field, language);
  const categoryText:Record<ScoutingCase['observation_category'],string>={
    general_observation:t('General observation','सामान्य जाँच'),
    visual_symptom:t('Visible symptom','दिखने वाला लक्षण'),
    pest_observed:t('Pest seen','कीट दिखाई दिया'),
    water_related:t('Water-related','पानी से जुड़ी बात'),
    growth_stage:t('Growth stage','विकास अवस्था'),
    other:t('Other','अन्य'),
    unknown:t('Not recorded','दर्ज नहीं'),
  };
  const stageText:Record<ScoutingCase['growth_stage'],string>={
    emergence:t('Emergence','अंकुरण'),
    vegetative:t('Vegetative','वृद्धि'),
    flowering:t('Flowering','फूल आना'),
    fruiting:t('Fruiting','फल/दाना बनना'),
    maturity:t('Maturity','पकना'),
    harvested:t('Harvested','कटाई'),
    unknown:t('Not recorded','दर्ज नहीं'),
  };
  const severityText:Record<ScoutingCase['severity'],string>={
    mild:t('Mild','कम'),
    moderate:t('Moderate','मध्यम'),
    severe:t('Severe','अधिक'),
    unknown:t('Unknown','पता नहीं'),
    not_applicable:t('Not applicable','लागू नहीं'),
  };
  const ready = !loading && !error && !invalidRange;
  const csv = () => toCsv([
    ['field_id','field_name','crop_user_reported','area_hectares','boundary_version','date','acquired_at','scene_id','ndvi','ndmi','ndre','usable_coverage_percent','usable_pixels','accepted','quality_reason','source','provenance','calculation_version','execution_mode'],
    ...selected.map(item => [field.id,field.name,field.crop,Number(field.area_hectares),item.boundary_version,item.observed_on,item.acquired_at,item.scene_id,item.ndvi_value == null ? null : Number(item.ndvi_value),item.ndmi_value == null ? null : Number(item.ndmi_value),item.ndre_value == null ? null : Number(item.ndre_value),item.valid_coverage_percent == null ? null : Number(item.valid_coverage_percent),item.valid_pixel_count,item.accepted,item.quality_reason,item.source,item.provenance,item.calculation_version,'real']),
  ]);
  const inspectionCsv = () => toCsv([
    ['field_id','field_name','crop_user_reported','date','observation_category','growth_stage_owner_reported','severity_owner_reported','symptoms_owner_reported','notes_owner_reported','provenance','verification_status','photo_count','photo_quality'],
    ...selectedInspections.map(item => [field.id,field.name,item.crop ?? field.crop,item.observed_on,item.observation_category,item.growth_stage,item.severity,item.symptoms,item.notes,item.provenance,item.verification_status,item.photos.length,item.photos.map(photo=>photo.quality).join(';')]),
  ]);
  return <article className="field-report">
    <div className="report-toolbar no-print"><div><h2>{t('Field report', 'खेत की रिपोर्ट')}</h2><p>{t('Choose dates. Only this field’s current boundary is included.', 'तारीख़ें चुनें। इस खेत की अभी की सीमा की जानकारी ही शामिल है।')}</p></div><div className="report-dates"><label>{t('From', 'से')}<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>{t('To', 'तक')}<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)}/></label></div>
      <div className="button-row"><button disabled={!ready||!extrasReady} onClick={() => window.print()}><Printer size={17} aria-hidden="true"/>{t('Print / save PDF', 'प्रिंट / PDF सेव करें')}</button><button disabled={!ready || !selected.length} onClick={() => saveFile(`chm-${field.id}-readings.csv`, csv(), 'text/csv;charset=utf-8')}><Download size={17} aria-hidden="true"/>{t('Download readings CSV', 'रीडिंग CSV डाउनलोड करें')}</button><button disabled={!ready||!selectedInspections.length} onClick={() => saveFile(`chm-${field.id}-inspections.csv`, inspectionCsv(), 'text/csv;charset=utf-8')}><Download size={17} aria-hidden="true"/>{t('Download inspections CSV','जाँच CSV डाउनलोड करें')}</button><button disabled={!field.boundary_geojson} onClick={() => saveFile(`chm-${field.id}-boundary.geojson`, JSON.stringify({type:'Feature',properties:{field_id:field.id,name:field.name,boundary_version:field.boundary_version,provenance:field.provenance,crop_user_reported:field.crop},geometry:field.boundary_geojson},null,2), 'application/geo+json')}>{t('Download boundary', 'सीमा डाउनलोड करें')}</button></div>
    </div>
    {invalidRange && <p role="alert">{t('The end date must be on or after the start date.', 'अंतिम तारीख़ पहली तारीख़ के बाद या उसी दिन होनी चाहिए।')}</p>}
    {loading ? <p role="status">{t('Preparing report…', 'रिपोर्ट तैयार हो रही है…')}</p> : error ? <p role="alert">{t('Report data could not be loaded. Exports are disabled until the data is available.', 'रिपोर्ट की जानकारी नहीं मिली। जानकारी आने तक डाउनलोड बंद है।')} <button onClick={() => { setLoading(true); setReload(value => value+1); }}>{t('Retry', 'फिर कोशिश करें')}</button></p> : !invalidRange && <>
      <header className="report-heading"><span className="eyebrow">TERRASCOPE</span><h1>{field.name}</h1><p>{field.crop || t('Crop unknown', 'फ़सल अज्ञात')} · {area(field.area_hectares)}</p><p>{t('Report range', 'रिपोर्ट की अवधि')}: {from ? date(from) : t('First record', 'पहले रिकॉर्ड से')} — {to ? date(to) : t('Latest record', 'पिछले रिकॉर्ड तक')}</p><p>{t('Boundary version', 'सीमा का संस्करण')}: {field.boundary_version ?? 1}</p></header>
      <section><h3>{t('Latest field summary', 'खेत का पिछला सारांश')}</h3><p><strong>{copy.title}</strong> · {t('Image date', 'तस्वीर की तारीख़')}: {date(field.latestObservation?.observed_on)}</p><p>{copy.explanation}</p><p className="quiet">{t('The latest summary may use an image outside the chosen report dates. The table and chart below follow your selected dates.', 'पिछले सारांश की तस्वीर चुनी अवधि से बाहर की हो सकती है। नीचे की तालिका और ग्राफ़ आपकी चुनी तारीख़ों के हैं।')}</p></section>
      <section><h3>{t('Recorded vegetation readings', 'दर्ज हरियाली की रीडिंग')}</h3>{selected.some(item => item.accepted && item.provenance === 'measured_imagery') && <VegetationChart observations={selected.filter(item => item.accepted && item.provenance === 'measured_imagery')}/>}
        {selected.length ? <div className="table-scroll"><table><thead><tr><th>{t('Image date', 'तस्वीर की तारीख़')}</th><th>NDVI</th><th>{t('Clear view', 'साफ़ हिस्सा')}</th><th>{t('Image use', 'तस्वीर का उपयोग')}</th><th>{t('Source', 'स्रोत')}</th></tr></thead><tbody>{selected.map(item => <tr key={`${item.observed_on}-${item.scene_id}`}><td>{date(item.observed_on)}</td><td>{item.ndvi_value ?? t('Unknown', 'अज्ञात')}</td><td>{item.valid_coverage_percent != null ? `${item.valid_coverage_percent}%` : t('Unknown', 'अज्ञात')}</td><td>{item.accepted ? t('Accepted', 'स्वीकृत') : t('Not accepted', 'उपयोग नहीं किया')}</td><td>{item.source} · {item.provenance}</td></tr>)}</tbody></table></div> : <p>{t('No readings in the selected date range for this boundary.', 'इस सीमा और अवधि की कोई रीडिंग नहीं है।')}</p>}
      </section><section><h3>{t('Field diary in this period', 'इस अवधि की खेत डायरी')}</h3>{diary.length ? <ul>{diary.map(event => <li key={event.id}>{date(event.event_date)} · {event.event_type} · {event.notes || t('No note', 'नोट नहीं')}</li>)}</ul> : <p>{t('No diary entries in this period.', 'इस अवधि में डायरी में कोई नोट नहीं है।')}</p>}</section>
      <section><h3>{t('Scouting inspections in this period','इस अवधि की खेत जाँच')}</h3><p className="quiet">{t('These are owner-reported observations, not expert-verified labels or diagnoses.','ये खेत-मालिक की रिपोर्ट हैं; विशेषज्ञ द्वारा सत्यापित जानकारी या बीमारी की पहचान नहीं।')}</p>{selectedInspections.length?<div className="inspection-report-list">{selectedInspections.map(item=><article key={item.id}><h4>{date(item.observed_on)} · {categoryText[item.observation_category]}</h4><p>{t('Growth stage','विकास अवस्था')}: {stageText[item.growth_stage]} · {t('Reported severity','बताई गई गंभीरता')}: {severityText[item.severity]}</p>{item.symptoms&&<p>{t('What was seen','क्या दिखा')}: {item.symptoms}</p>}{item.notes&&<p>{t('Notes','नोट')}: {item.notes}</p>}<p className="quiet">{t('Owner-reported; not expert-verified.','खेत के मालिक की रिपोर्ट; विशेषज्ञ द्वारा सत्यापित नहीं।')} · {item.photos.length} {t('photo(s)','फ़ोटो')}</p>{item.photos.map(photo=><figure key={photo.id}><img className="scouting-photo-preview" loading="lazy" alt={t('Owner-reported scouting photo','खेत-मालিক की जाँच की फ़ोटो')} src={`/api/fields/${field.id}/scouting/${item.id}/photos/${photo.id}`}/><figcaption>{t('Photo quality','फ़ोटो की गुणवत्ता')}: {photo.quality}</figcaption></figure>)}</article>)}</div>:<p>{t('No scouting inspections in the selected date range.','चुनी अवधि में खेत की कोई जाँच नहीं है।')}</p>}</section>
      <ReportAppendix key={field.id} field={field} from={from} to={to} onReady={markExtrasReady}/>
      <footer><p>{t('Crop, field name and dates are user-reported. Satellite vegetation readings are not a disease diagnosis, yield prediction or irrigation prescription.', 'फ़सल, खेत का नाम और तारीख़ें उपयोगकर्ता ने दर्ज की हैं। Satellite की हरियाली की रीडिंग बीमारी की पहचान, उपज का अनुमान या सिंचाई की सलाह नहीं है।')}</p><p>{t('Generated', 'रिपोर्ट बनाई')}: {date(new Date().toISOString())}</p></footer>
    </>}
  </article>;
}
