import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFieldJobs, queueFieldJob, type DatabaseField, type ProcessingJob } from '../../lib/api';
import { usePreferences } from '../../lib/preferencesContext';

export function ImageCheckPanel({ field, onComplete }: { field: DatabaseField; onComplete: () => Promise<void> }) {
  const { t, date } = usePreferences();
  const [job, setJob] = useState<ProcessingJob | null>(field.latestJob ?? null);
  const [error, setError] = useState(false);
  const [startError, setStartError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const currentId = useRef(field.id);
  const previous = useRef<ProcessingJob | null>(field.latestJob ?? null);
  const completed = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    currentId.current = field.id;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const jobs = await loadFieldJobs(field.id);
        if (stopped) return;
        const latest = jobs.find(item => item.kind === 'satellite' && item.boundary_version === (field.boundary_version ?? 1)) ?? null;
        const finished = latest && ['succeeded','failed'].includes(latest.status);
        const wasActive = previous.current && previous.current.id === latest?.id && ['queued','running'].includes(previous.current.status);
        previous.current = latest;
        setJob(latest); setError(false);
        if (finished && wasActive && completed.current !== latest.id) {
          completed.current = latest.id;
          await onCompleteRef.current();
        }
        if (!stopped) timer = setTimeout(() => void read(), latest && ['queued','running'].includes(latest.status) ? 1500 : 15000);
      } catch {
        if (!stopped) { setError(true); timer = setTimeout(() => void read(), 5000); }
      }
    };
    void read();
    return () => { stopped = true; clearTimeout(timer); };
  }, [field.id, field.boundary_version, pollVersion]);
  const start = useCallback(async () => {
    setStarting(true); setError(false); setStartError(false);
    try {
      const queued = await queueFieldJob(field.id);
      if (currentId.current !== field.id) return;
      previous.current = queued; setJob(queued); setPollVersion(value => value + 1);
    } catch { setStartError(true); }
    finally { setStarting(false); }
  }, [field.id]);
  const active = job?.status === 'queued' || job?.status === 'running';
  const message = !job ? t('Check recent satellite images for this field.', 'इस खेत की हाल की satellite तस्वीरें देखें।')
    : job.status === 'queued' ? t('Image check is waiting. You can leave this page.', 'तस्वीर की जाँच कतार में है। आप यह पेज छोड़ सकते हैं।')
    : job.status === 'running' ? t('Checking images for a clear view of your field…', 'खेत की साफ़ तस्वीर खोज रहे हैं…')
    : job.status === 'failed' ? t('Image check could not finish. Your field and previous image are safe. Try again.', 'तस्वीर की जाँच पूरी नहीं हुई। खेत और पिछली तस्वीर सुरक्षित हैं। दोबारा कोशिश करें।')
    : job.result?.accepted ? t('A usable image was found. The field summary has been updated.', 'साफ़ तस्वीर मिल गई। खेत की जानकारी अपडेट हो गई है।')
    : t('No usable new image was found. Previous measurements remain available. Try again later.', 'नई साफ़ तस्वीर नहीं मिली। पिछली जानकारी उपलब्ध है। बाद में फिर कोशिश करें।');
  return <section id="image-check" tabIndex={-1} className="image-check no-print" aria-label={t('Satellite image check', 'उपग्रह की तस्वीर खोजें')}>
    <div><h3>{t('Find a clear picture', 'साफ़ तस्वीर खोजें')}</h3><p role="status" aria-live="polite">{message}</p>
      {job?.finished_at && <small>{t('Last check', 'पिछली जाँच')}: {date(job.finished_at)}</small>}
      {active && <p className="quiet">{t('Progress is saved. Reopening this field will show the same check.', 'जाँच की स्थिति सेव है। खेत दोबारा खोलने पर यही जाँच दिखेगी।')}</p>}
      {error && <p role="alert">{t('Unable to check progress. Check your connection and retry.', 'स्थिति नहीं मिल रही। इंटरनेट कनेक्शन देखकर फिर कोशिश करें।')} <button type="button" onClick={()=>setPollVersion(value=>value+1)}>{t('Retry progress check','स्थिति फिर देखें')}</button></p>}
      {startError && <p role="alert">{t('Image check could not be started. Your field is safe. Please retry.', 'तस्वीर की जाँच शुरू नहीं हुई। आपका खेत सुरक्षित है। फिर कोशिश करें।')}</p>}
    </div>
    <button type="button" className="primary-action" disabled={starting || active || !field.boundary_geojson} onClick={() => void start()}>{starting || active ? t('Checking images…', 'तस्वीरें जाँच रहे हैं…') : job?.status === 'failed' ? t('Retry image check', 'दोबारा जाँच करें') : t('Check for a new image', 'नई तस्वीर देखें')}</button>
    {job && <details className="job-details"><summary>{t('Technical details', 'तकनीकी जानकारी')}</summary><p>{job.progress}</p>{job.error && <p>{job.error}</p>}<small>{t('Job', 'जाँच ID')}: {job.id}</small></details>}
  </section>;
}
