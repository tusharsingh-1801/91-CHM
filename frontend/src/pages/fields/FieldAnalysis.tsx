import { useEffect, useState, lazy, Suspense, type FormEvent } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { qualityReason, seasonStage } from '../../../../shared/evidence';
import { SeasonHistoryPanel } from '../../features/fields/SeasonHistoryPanel';
import { useStageLabel } from '../../features/fields/season';
import { loadNdviAnalysis, loadNdvi, askFieldAssistant, loadWeather, queueFieldJob, loadFieldEvents, loadFieldJobs, type DatabaseField, type NdviAnalysis, type VegetationIndexObservation, type WeatherObservation, type FieldEvent } from '../../lib/api';
import { usePreferences } from '../../lib/preferencesContext';
import { fieldCopy } from '../../lib/fieldCopy';
const VegetationChart=lazy(()=>import('../../features/fields/VegetationChart').then(module=>({default:module.VegetationChart})));
const MonthlyBestNdvi=lazy(()=>import('../../features/fields/MonthlyBestNdvi').then(module=>({default:module.MonthlyBestNdvi})));
const HistoricalWeatherCharts=lazy(()=>import('../../features/weather/HistoricalWeatherCharts').then(module=>({default:module.HistoricalWeatherCharts})));

export function FieldAnalysis() {
  const { field, editField } = useOutletContext<{ field: DatabaseField; editField?: () => void }>();
  const { t, language, date } = usePreferences();
  const [analysis, setAnalysis] = useState<NdviAnalysis | null>(null);
  const [observations, setObservations] = useState<VegetationIndexObservation[]>([]);
  const [weather, setWeather] = useState<WeatherObservation[]>([]);
  const [events, setEvents] = useState<FieldEvent[]>([]);
  const [range, setRange] = useState('90');
  const [olderDate, setOlderDate] = useState('');
  const [newerDate, setNewerDate] = useState('');
  const [viewTime] = useState(() => Date.now());
  const [index, setIndex] = useState<'ndvi_value'|'ndmi_value'|'ndre_value'>('ndvi_value');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [evidenceDates, setEvidenceDates] = useState<string[]>([]);
  const [assistantError, setAssistantError] = useState('');
  const [asking, setAsking] = useState(false);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherMessage, setWeatherMessage] = useState<'queued'|'failed'|null>(null);
  const languageCode = language === 'hi' ? 'hi-IN' : 'en-IN';
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([loadNdviAnalysis(field.id, languageCode), loadNdvi(field.id), loadWeather(field.id), loadFieldEvents(field.id)]).then(results => {
      if (cancelled) return;
      const [result, readings, climate, diary] = results;
      setAnalysis(result.status === 'fulfilled' ? result.value : null);
      setObservations(readings.status === 'fulfilled' ? readings.value : []);
      setWeather(climate.status === 'fulfilled' ? climate.value : []);
      setEvents(diary.status === 'fulfilled' ? diary.value : []);
      setError(results.some(item => item.status === 'rejected')); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [field.id, languageCode, reload]);
  useEffect(() => {
    if (weatherMessage !== 'queued') return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const job = (await loadFieldJobs(field.id)).find(item => item.kind === 'weather' && item.boundary_version === (field.boundary_version ?? 1));
        if (stopped) return;
        if (job?.status === 'succeeded') { setWeather(await loadWeather(field.id)); setWeatherMessage(null); return; }
        if (job?.status === 'failed') { setWeatherMessage('failed'); return; }
      } catch { /* Keep the queued notice and retry; the durable job is unaffected. */ }
      if (!stopped) timer = setTimeout(() => void check(), 2000);
    };
    void check(); return () => { stopped = true; clearTimeout(timer); };
  }, [field.id, field.boundary_version, weatherMessage]);
  const accepted = observations.filter(item => item.accepted && item.provenance === 'measured_imagery' && item.boundary_version === (field.boundary_version ?? 1) && !qualityReason(item, field.policy));
  const dated = [...new Map([...accepted].sort((a,b) => Date.parse(a.acquired_at || a.observed_on)-Date.parse(b.acquired_at || b.observed_on)).map(item => [item.observed_on,item])).values()].sort((a,b) => a.observed_on.localeCompare(b.observed_on));
  const cutoff = range === 'season' ? field.planting_date ? Date.parse(field.planting_date) : 0 : viewTime-Number(range)*86400000;
  const latestMethod = dated.at(-1)?.calculation_version;
  const chart = dated.filter(item => Date.parse(item.observed_on) >= cutoff && item.calculation_version === latestMethod);
  const selectedNewer = dated.find(item => item.observed_on === newerDate) ?? dated.at(-1);
  const selectedOlder = dated.find(item => item.observed_on === olderDate && item.observed_on !== selectedNewer?.observed_on) ?? dated.filter(item => item.observed_on !== selectedNewer?.observed_on).at(-1);
  const comparable = selectedOlder && selectedNewer && selectedOlder.observed_on < selectedNewer.observed_on && selectedOlder.calculation_version === selectedNewer.calculation_version;
  const change = comparable ? Number(selectedNewer.ndvi_value)-Number(selectedOlder.ndvi_value) : null;
  const copy = fieldCopy(field, language);
  const stageLabel = useStageLabel();
  const season = { plantingDate: field.planting_date, harvestDate: field.harvest_date };
  const latestStage = dated.at(-1) ? seasonStage(season, dated.at(-1)!.observed_on) : null;
  async function ask(event: FormEvent) {
    event.preventDefault(); if (!question.trim() || asking) return;
    setAsking(true); setAnswer(''); setAssistantError('');
    try { const result = await askFieldAssistant(question, field.id, languageCode); setAnswer(result.answer); setEvidenceDates(result.evidenceDates ?? []); }
    catch (caught) { setAssistantError(caught instanceof Error ? caught.message : 'Assistant unavailable'); }
    finally { setAsking(false); }
  }
  if (loading) return <div className="analysis-layout" role="status">{t('Loading analysis…', 'बदलाव की जानकारी ला रहे हैं…')}</div>;
  return <div className="analysis-layout">
    <div className="content-heading"><h2>{t('Changes over time', 'समय के साथ बदलाव')}</h2><Link to={`/fields/${field.id}/report`}>{t('Open report', 'रिपोर्ट खोलें')} →</Link></div>
    {error && <p className="error-notice" role="alert">{t('Some information could not be loaded. Available readings are shown below.', 'कुछ जानकारी नहीं मिली। उपलब्ध रीडिंग नीचे हैं।')} <button onClick={() => { setLoading(true); setReload(value => value+1); }}>{t('Retry analysis', 'फिर कोशिश करें')}</button></p>}
    <section className="analysis-summary"><h3>{copy.title}</h3><p>{copy.explanation}</p>{analysis && <details><summary>{t('More about the trend', 'बदलाव की अधिक जानकारी')}</summary><p>{analysis.summary}</p>{analysis.recommendation && <p>{analysis.recommendation}</p>}</details>}</section>
    {comparable && change != null && <section className="picture-change" aria-label={t('Picture comparison summary', 'तस्वीरों में बदलाव का सारांश')}><strong>{change < 0 ? t('The crop looked less green in the later picture', 'बाद की तस्वीर में हरियाली कम दिखी') : change > 0 ? t('The crop looked greener in the later picture', 'बाद की तस्वीर में हरियाली ज़्यादा दिखी') : t('Greenness looked similar in both pictures', 'दोनों तस्वीरों में हरियाली एक जैसी दिखी')}</strong><p>{date(selectedOlder.observed_on)} → {date(selectedNewer.observed_on)}</p><p>{t('This describes those two pictures. A field visit helps explain the change.', 'यह इन दो तस्वीरों का बदलाव है। वजह समझने के लिए खेत में देखें।')}</p></section>}
    <section className="vegetation-trends" aria-label={t('Vegetation trends', 'हरियाली में बदलाव')}><h3>{t('What changed in the field?', 'खेत में क्या बदला?')}</h3><p>{t('Each dot is one satellite picture. A falling line is a reason to inspect the field.', 'हर बिंदु एक सैटेलाइट तस्वीर है। लाइन नीचे जाए तो खेत जाँचें।')}</p>
      <div className="analysis-controls"><label>{t('Date range', 'समय अवधि')}<select value={range} onChange={event => setRange(event.target.value)}><option value="30">{t('30 days', '30 दिन')}</option><option value="90">{t('90 days', '90 दिन')}</option><option value="season">{field.planting_date ? t('Since recorded planting', 'दर्ज बुवाई से') : t('All available dates', 'सभी उपलब्ध तारीख़ें')}</option></select></label><label>{t('Show on chart', 'ग्राफ़ में क्या देखें')}<select value={index} onChange={event => setIndex(event.target.value as typeof index)}><option value="ndvi_value">{t('Greenness (NDVI)', 'हरियाली (NDVI)')}</option><option value="ndmi_value">{t('Water signal in plants (NDMI)', 'पौधों में पानी का संकेत (NDMI)')}</option><option value="ndre_value">{t('Leaf colour signal (NDRE)', 'पत्तियों के रंग का संकेत (NDRE)')}</option></select></label></div>
      {chart.length ? <Suspense fallback={<p aria-live="polite">{t('Loading chart…','ग्राफ़ लोड हो रहा है…')}</p>}><VegetationChart simple observations={chart} index={index} season={season} rain={weather} events={events.filter(item => Date.parse(item.event_date) >= cutoff)}/></Suspense> : <p>{t('No accepted observations in this range. Find a usable image on the Map tab.', 'इस अवधि की साफ़ तस्वीर नहीं है। नक्शे वाले पेज पर नई तस्वीर जाँचें।')}</p>}
          {latestStage && <p className="season-stage-line">{t('Crop stage at the latest image (from your sowing/harvest dates):','नई तस्वीर के समय फ़सल की अवस्था (आपकी बुवाई/कटाई की तारीख़ों से):')} <strong>{stageLabel(latestStage)}</strong></p>}
      {dated.length>0&&<Suspense fallback={<p aria-live="polite">{t('Loading monthly comparison…','महीनों की तुलना लोड हो रही है…')}</p>}><MonthlyBestNdvi observations={dated.filter(item=>item.calculation_version===latestMethod)}/></Suspense>}
      <SeasonHistoryPanel field={field} onEditDates={editField} onComplete={() => setReload(value => value + 1)}/>
    </section>
    <details className="technical-observations"><summary>{t('Advanced: measurements', 'तकनीकी जानकारी: रीडिंग')}</summary>
      <section aria-label={t('Two-date comparison', 'दो तारीख़ों की तुलना')}><h3>{t('Compare two accepted images', 'दो साफ़ तस्वीरों की तुलना')}</h3>{dated.length < 2 ? <p>{t('Two accepted acquisition dates are needed for comparison.', 'तुलना के लिए दो तारीख़ों की साफ़ तस्वीर चाहिए।')}</p> : <><div className="analysis-controls"><label>{t('Earlier acquisition', 'पहली तस्वीर')}<select value={selectedOlder?.observed_on || ''} onChange={event => setOlderDate(event.target.value)}>{dated.filter(item => item.observed_on !== selectedNewer?.observed_on).map(item => <option key={item.observed_on} value={item.observed_on}>{date(item.observed_on)}</option>)}</select></label><label>{t('Later acquisition', 'दूसरी तस्वीर')}<select value={selectedNewer?.observed_on || ''} onChange={event => setNewerDate(event.target.value)}>{dated.filter(item => item.observed_on !== selectedOlder?.observed_on).map(item => <option key={item.observed_on} value={item.observed_on}>{date(item.observed_on)}</option>)}</select></label></div>{[selectedOlder,selectedNewer].map(item => item && <p key={item.scene_id}>{date(item.observed_on)} · NDVI {item.ndvi_value} · {t('clear view', 'साफ़ हिस्सा')} {item.valid_coverage_percent}%</p>)}<p>{change == null ? t('These dates are not comparable: check their order and calculation versions.', 'ये तारीख़ें तुलना योग्य नहीं: क्रम और गणना के संस्करण जाँचें।') : t(`NDVI change between these dates: ${change.toFixed(3)}. This is not a diagnosis or verified recovery.`, `इन तारीख़ों के बीच NDVI बदलाव: ${change.toFixed(3)}। यह बीमारी की पहचान या ठीक होने की पुष्टि नहीं है।`)}</p></>}</section>
      <section aria-label={t('Acquisition timeline', 'तस्वीरों की समयरेखा')}><h3>{t('Acquisition timeline', 'तस्वीरों की समयरेखा')}</h3>{accepted.length ? <ol>{accepted.map(item => <li key={`${item.observed_on}-${item.scene_id}`}>{date(item.observed_on)} · {t('clear view', 'साफ़ हिस्सा')} {item.valid_coverage_percent}%</li>)}</ol> : <p>{t('No accepted images are available for this boundary.', 'इस सीमा की कोई साफ़ तस्वीर नहीं है।')}</p>}</section>
      <p>{t('NDVI describes vegetation, not disease. NDMI is not soil-moisture percentage; NDRE is not a fertilizer prescription.', 'NDVI हरियाली बताता है, बीमारी नहीं। NDMI मिट्टी में पानी का प्रतिशत नहीं है; NDRE खाद की मात्रा की सलाह नहीं है।')}</p>
      {observations.length ? <div className="table-scroll" role="region" aria-label={t('Vegetation observations', 'हरियाली की रीडिंग')} tabIndex={0}><table><thead><tr><th>{t('Date', 'तारीख़')}</th><th>{t('Cloud cover', 'बादल')}</th><th>NDVI</th><th>NDRE</th><th>NDMI</th><th>{t('Coverage / status', 'साफ़ हिस्सा / स्थिति')}</th></tr></thead><tbody>{observations.map((item, i) => <tr key={i}><td>{date(item.observed_on)}</td><td>{item.cloud_cover == null ? '—' : `${item.cloud_cover}%`}</td><td>{item.ndvi_value == null ? '—' : Number(item.ndvi_value).toFixed(3)}</td><td>{item.ndre_value == null ? '—' : Number(item.ndre_value).toFixed(3)}</td><td>{item.ndmi_value == null ? '—' : Number(item.ndmi_value).toFixed(3)}</td><td>{item.valid_coverage_percent ?? '—'} · {item.accepted ? t('Accepted', 'स्वीकृत') : t('Not accepted', 'उपयोग नहीं किया')}</td></tr>)}</tbody></table></div> : <p>{t('No observations recorded yet.', 'अभी कोई रीडिंग दर्ज नहीं है।')}</p>}
    </details>
    <details className="weather-details"><summary>{t('Past weather near this field', 'खेत के आसपास का पिछला मौसम')}</summary><div className="content-heading"><h3>{t('Past weather', 'पिछला मौसम')}</h3><button disabled={weatherBusy || weatherMessage === 'queued'} onClick={async () => { setWeatherBusy(true); try { await queueFieldJob(field.id, 'weather'); setWeatherMessage('queued'); } catch { setWeatherMessage('failed'); } finally { setWeatherBusy(false); } }}>{weatherBusy || weatherMessage === 'queued' ? t('Checking weather…', 'मौसम की जानकारी ला रहे हैं…') : t('Update past weather', 'पिछले मौसम की जानकारी लाएँ')}</button></div><p>{t('Usually 2–3 days behind.', 'आम तौर पर 2–3 दिन पीछे।')}</p>{weatherMessage && <p role="status">{weatherMessage === 'queued' ? t('Weather update queued. You can leave this page.', 'मौसम की जानकारी कतार में है। आप पेज छोड़ सकते हैं।') : t('Weather update could not finish. Please retry.', 'मौसम की जानकारी नहीं आई। फिर कोशिश करें।')}</p>}
      {weather.length ? <><Suspense fallback={<p aria-live="polite">{t('Loading weather charts…','मौसम के ग्राफ़ लोड हो रहे हैं…')}</p>}><HistoricalWeatherCharts weather={weather}/></Suspense></> : <p>{t('No past weather loaded yet. Use the update button above.', 'पिछला मौसम अभी उपलब्ध नहीं है। ऊपर वाला बटन दबाएँ।')}</p>}
    </details>
    <section className="assistant-panel" aria-labelledby="assistant-title"><h3 id="assistant-title">{t('Ask about this field', 'इस खेत के बारे में पूछें')}</h3><p>{t('Answers use your field records.', 'जवाब आपके खेत की जानकारी पर आधारित होते हैं।')}</p><form onSubmit={ask}><label>{t('Your question', 'आपका सवाल')}<textarea aria-label={t('Question for field assistant', 'खेत के सहायक के लिए सवाल')} value={question} onChange={event => setQuestion(event.target.value)} placeholder={t('e.g. What changed in my field?', 'जैसे: मेरे खेत में क्या बदला है?')} maxLength={2000} rows={3} required/></label><button type="submit" className="primary-action" disabled={asking || !question.trim()}>{asking ? t('Thinking…', 'जवाब ला रहे हैं…') : t('Ask AI', 'सहायक से पूछें')}</button></form>{assistantError && <div className="assistant-error" role="alert"><p>{t('Assistant unavailable. Your field records are still available.', 'सहायक उपलब्ध नहीं है। खेत की जानकारी सुरक्षित और उपलब्ध है।')}</p><details><summary>{t('Technical details', 'तकनीकी जानकारी')}</summary>{assistantError}</details></div>}{answer && <div className="assistant-answer"><strong>{t('Answer:', 'जवाब:')}</strong><p>{answer}</p><p className="quiet">{t('Satellite evidence dates', 'Satellite जानकारी की तारीख़ें')}: {evidenceDates.length ? evidenceDates.map(value => date(value)).join(', ') : t('No dated imagery supplied', 'तारीख़ वाली तस्वीर उपलब्ध नहीं')}</p></div>}</section>
  </div>;
}
