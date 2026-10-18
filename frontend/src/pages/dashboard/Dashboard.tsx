import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Camera, CloudSun, MapPin, Sprout, Search, SlidersHorizontal } from 'lucide-react';
import { loadFields, type DatabaseField } from '../../lib/api';
import { fieldActionHref, fieldAssessment, fieldCopy } from '../../lib/fieldCopy';
import { usePreferences } from '../../lib/preferencesContext';
import { AddFieldWizard } from '../../features/fields/AddFieldWizard';
import { cropPhoto } from '../../lib/cropPhotos';
import { DashboardAddons } from '../../features/dashboard/DashboardAddons';
import { VisitNotifications } from '../../features/dashboard/VisitNotifications';
import { FarmerWelcome } from '../../features/dashboard/FarmerWelcome';

export function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#my-fields') document.getElementById('my-fields')?.scrollIntoView();
  }, [location.hash]);
  const { t, language, date, area } = usePreferences();
  const [fields, setFields] = useState<DatabaseField[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [includeDemo, setIncludeDemo] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadFields().then(data => { if (!cancelled) setFields(data); }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);
  const isDemo = (field: DatabaseField) => field.isDemo || field.provenance === 'demo' || field.provenance === 'public_boundary';
  const real = fields.filter(field => !isDemo(field));
  const inspection = real.filter(field => fieldAssessment(field).state === 'needs_inspection');
  const dataIssues = real.filter(field => ['image_too_old', 'not_enough_data', 'awaiting_analysis'].includes(fieldAssessment(field).state));
  const due = real.filter(field => Number(field.dueTasks) > 0);
  const priority = [...new Map([...inspection, ...due, ...dataIssues].map(field => [field.id, field])).values()];
  // Keep urgent real fields above routine fields, while making demo entries clearly secondary.
  const urgency = (field: DatabaseField) => {
    if (fieldAssessment(field).state === 'needs_inspection') return 0;
    if (Number(field.dueTasks) > 0) return 1;
    if (['image_too_old', 'not_enough_data', 'awaiting_analysis'].includes(fieldAssessment(field).state)) return 2;
    return 3;
  };
  const visible = fields.filter(field => (includeDemo || !isDemo(field))
    && `${field.name} ${field.crop}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    && (filter === 'all' || (filter === 'data' ? ['image_too_old', 'not_enough_data', 'awaiting_analysis'].includes(fieldAssessment(field).state) : filter === 'due' ? Number(field.dueTasks) > 0 : fieldAssessment(field).state === filter)))
    .sort((a, b) => Number(isDemo(a)) - Number(isDemo(b)) || urgency(a) - urgency(b) || a.name.localeCompare(b.name, language === 'hi' ? 'hi' : 'en'));
  const choose = (value: string) => { setFilter(value); document.getElementById('my-fields')?.scrollIntoView({ behavior: 'smooth' }); };
  const hasFilters = Boolean(query.trim() || filter !== 'all');
  const attentionCount = priority.length;
  return <main className="dashboard-shell simple-farm">
    {!error && !loading && <FarmerWelcome fields={fields}/> }
    <header className="dashboard-header overview-header farmer-hero">
      <div><span className="eyebrow">{t('YOUR DAILY FIELD COMPANION', 'हर दिन, आपके खेत का साथी')}</span>
        <h1>{t('Your farm. Your next step.', 'आपके खेत। अब क्या करें?')}</h1>
        <p>{t('Choose a field, see what needs doing, and keep a note of your visit.', 'खेत चुनें, अगला काम देखें और खेत में जो दिखे उसे सेव करें।')}</p>
      </div>
      <button className="primary-action" onClick={() => setAdding(true)}>{t('+ Add field', '+ खेत जोड़ें')}</button>
    </header>
    <nav className="overview-nav farmer-quick-nav" aria-label={t('Main navigation', 'मुख्य नेविगेशन')}>
      <a href="#my-fields">{t('My fields', 'मेरे खेत')}</a><Link to="/reports">{t('Reports', 'रिपोर्ट')}</Link><Link to="/help">{t('How to use', 'कैसे इस्तेमाल करें')}</Link><Link to="/gallery">{t("Crop & satellite photos", "फ़सल और सैटेलाइट तस्वीरें")}</Link>
    </nav>
    {error && <div className="service-error" role="alert"><strong>{t('Fields unavailable', 'खेतों की जानकारी नहीं मिली')}</strong><span>{t('Check your connection and try again. Your saved fields are safe.', 'कनेक्शन देखकर फिर कोशिश करें। आपके सेव किए खेत सुरक्षित हैं।')}</span><button onClick={() => { setLoading(true); setError(false); setReload(value => value + 1); }}>{t('Retry', 'फिर कोशिश करें')}</button></div>}
    {!error && !loading && <>
      {real.length > 0 && <section id="overview" className={`attention-panel next-step-panel farmer-priority ${inspection.length ? 'needs-visit' : ''}`} aria-labelledby="attention-heading">
        <div className="next-step-heading"><span className="next-step-symbol" aria-hidden="true">{inspection.length || due.length ? <CalendarCheck/> : dataIssues.length ? <CloudSun/> : <Sprout/>}</span>
          <div><span className="eyebrow">{t('START HERE', 'यहाँ से शुरू करें')}</span>{attentionCount > 0 && <span className="farmer-attention-count">{t(`${attentionCount} fields need attention`, `${attentionCount} खेतों पर ध्यान दें`)}</span>}<h2 id="attention-heading">{inspection.length ? t('Visit these fields first', 'पहले इन खेतों को देखें') : due.length ? t('Your planned visits are due', 'तय जाँच का समय हो गया है') : dataIssues.length ? t('Let’s get a clearer picture', 'पहले साफ़ तस्वीर देखें') : t('Keep up your regular field visits', 'खेत की नियमित जाँच करते रहें')}</h2></div>
        </div>
        {!inspection.length && !due.length && dataIssues.length > 0 && <p className="unknown-message">{t('We cannot tell how these crops are doing yet. A missing or old picture does not mean crop damage.', 'इन खेतों की फ़सल का हाल अभी साफ़ नहीं है। पुरानी या गायब तस्वीर का मतलब फ़सल खराब होना नहीं है।')}</p>}
        {priority.slice(0, 3).map(field => {
          const copy = fieldCopy(field, language);
          return <article className="attention-row" key={field.id}><div><strong>{field.name}</strong><p>{copy.explanation}</p></div><Link className="primary-action" to={fieldActionHref(field)}>{copy.actionLabel}<ArrowRight size={17} aria-hidden="true"/></Link></article>;
        })}
        {priority.length > 3 && <button className="text-button" onClick={() => choose('all')}>{t(`See all ${priority.length} fields`, `सभी ${priority.length} खेत देखें`)}</button>}
        {!priority.length && <p>{t('No field is currently flagged for an urgent visit or missing picture. This is not a guarantee of crop health; keep checking in person.', 'अभी किसी खेत में ज़रूरी जाँच या तस्वीर की कमी का संकेत नहीं है। इसका मतलब फ़सल पूरी तरह स्वस्थ होना नहीं है; खेत में जाकर देखते रहें।')}</p>}
      </section>}
      {real.length > 0 && <section className="summary-grid compact-summary farmer-stats" aria-label={t('Farm summary', 'खेतों का सारांश')}>
        <button className="summary-tile inspection-tile" aria-pressed={filter === 'needs_inspection'} onClick={() => choose('needs_inspection')}><Sprout aria-hidden="true"/><strong>{inspection.length}</strong><span>{t('Fields to visit', 'जाकर देखने वाले खेत')}</span></button>
        <button className="summary-tile" aria-pressed={filter === 'data'} onClick={() => choose('data')}><CloudSun aria-hidden="true"/><strong>{dataIssues.length}</strong><span>{t('Waiting for pictures', 'तस्वीर चाहिए')}</span></button>
        <button className="summary-tile" aria-pressed={filter === 'due'} onClick={() => choose('due')}><CalendarCheck aria-hidden="true"/><strong>{due.length}</strong><span>{t('Visits / tasks due', 'तय काम बाकी')}</span></button>
        <button className="summary-tile" aria-pressed={filter === 'all'} onClick={() => choose('all')}><MapPin aria-hidden="true"/><strong>{real.length}</strong><span>{t('Your saved fields', 'आपके खेत')}</span></button>
      </section>}
      {real.length > 0 && <DashboardAddons fields={fields}/>}
      {real.length > 0 && <VisitNotifications fields={real}/>}
      <section id="my-fields" className="farmer-fields-section" aria-labelledby="fields-heading">
        <div className="section-heading"><div><h2 id="fields-heading">{t('My fields', 'मेरे खेत')}</h2><p className="section-caption">{t('Urgent field visits appear first, followed by fields waiting for pictures.', 'पहले ज़रूरी जाँच वाले खेत, फिर तस्वीर की प्रतीक्षा वाले खेत दिखेंगे।')}</p></div>{real.length > 0 && <span>{t(`${visible.length} shown`, `${visible.length} दिख रहे हैं`)}</span>}</div>
        {fields.some(isDemo) && <div className="sample-field-notice" role="note"><div><strong>{t('Sample fields available', 'नमूना खेत उपलब्ध हैं')}</strong><p>{t('Explore sample records separately from your own fields.', 'अपने खेतों से अलग नमूना रिकॉर्ड देखें।')}</p></div><button type="button" aria-pressed={includeDemo} onClick={() => setIncludeDemo(value => !value)}>{includeDemo ? t('Hide sample fields', 'नमूना खेत छिपाएँ') : t('Show sample fields', 'नमूना खेत देखें')}</button></div>}
        {fields.length > 0 && <div className="farmer-filter-area"><div className="farmer-search-row"><label className="farmer-search-label"><Search size={19} aria-hidden="true"/><span className="sr-only">{t("Search fields", "खेत खोजें")}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search your fields or crops", "खेत या फ़सल खोजें")}/></label><button type="button" className="farmer-filter-toggle" aria-expanded={showAdvancedFilters} onClick={() => setShowAdvancedFilters(value => !value)}><SlidersHorizontal size={18} aria-hidden="true"/>{t("Filters", "फ़िल्टर")}{filter !== "all" ? " •" : ""}</button></div>{showAdvancedFilters && <div className="field-filters">

          <label>{t('Show fields', 'कौन से खेत दिखाएँ')}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('All fields', 'सभी खेत')}</option><option value="needs_inspection">{t('Fields to visit', 'जाकर देखने वाले खेत')}</option><option value="data">{t('Waiting for pictures', 'तस्वीर चाहिए')}</option><option value="due">{t('Visits / tasks due', 'तय काम बाकी')}</option><option value="no_unusual_change">{t('No big change seen', 'बड़ा बदलाव नहीं दिखा')}</option></select></label>
          {fields.some(isDemo) && <label className="checkbox-label"><input type="checkbox" checked={includeDemo} onChange={event => setIncludeDemo(event.target.checked)}/>{t('Show demo & public parcels', 'डेमो और सार्वजनिक खेत दिखाएँ')}</label>}
        </div>}</div>}
        {visible.length ? <div className="field-grid farmer-field-grid">{visible.map(field => {
          const copy = fieldCopy(field, language);
          const active = field.latestJob && ['queued', 'running'].includes(field.latestJob.status);
          const ActionIcon = copy.action === 'visit' || copy.action === 'tasks' ? CalendarCheck : copy.action === 'images' ? CloudSun : Camera;
          return <article className={`field-card simple-field-card farmer-field-card card-${copy.assessment.state}`} key={field.id}>
            <div className="field-crop-photo"><img loading="lazy" src={cropPhoto(field.crop).src} alt={cropPhoto(field.crop).alt} onError={event => { event.currentTarget.style.display = "none"; }}/><span>{t("Crop photo", "फ़सल तस्वीर")}</span></div><div className="field-card-top"><div className="field-card-name"><span className="field-avatar" aria-hidden="true"><Sprout size={24}/></span><div><h3><Link to={`/fields/${field.id}/overview`}>{field.name}</Link></h3><small>{!field.crop || field.crop === 'Unknown' ? t('Crop not added', 'फ़सल का नाम नहीं जोड़ा') : field.crop} · {area(field.area_hectares)}</small></div></div></div>
            <div className="farmer-status-line"><span className={`evidence-status status-${copy.assessment.state}`}>{copy.title}</span></div><p className="card-explanation">{copy.explanation}</p>
            {isDemo(field) && <p className="demo-label">{t('Sample field · current crop is unverified', 'नमूना खेत · अभी की फ़सल सत्यापित नहीं')}</p>}
            {active && <p className="job-badge" role="status">{t('Looking for a clear picture…', 'साफ़ तस्वीर खोज रहे हैं…')}</p>}
            {field.latestJob?.status === 'failed' && <p className="job-badge job-failed">{t('Picture search stopped. Open this field to try again.', 'तस्वीर की खोज पूरी नहीं हुई। खेत खोलकर फिर कोशिश करें।')}</p>}
            {Number(field.dueTasks) > 0 && <p className="due-badge">{t(`${field.dueTasks} planned ${Number(field.dueTasks) === 1 ? 'task' : 'tasks'} due`, `${field.dueTasks} तय काम बाकी`)}</p>}
            <div className="card-next"><ActionIcon size={18} aria-hidden="true"/><span>{t('Next:', 'अगला काम:')} <strong>{copy.actionLabel}</strong></span></div>
            <details className="card-picture-details"><summary>{t('Picture date & details', 'तस्वीर की तारीख़ और जानकारी')}</summary><dl className="evidence-facts"><div><dt>{t('Last clear picture', 'पिछली साफ़ तस्वीर')}</dt><dd>{field.latestObservation ? date(field.latestObservation.observed_on) : t('Not available yet', 'अभी उपलब्ध नहीं')}</dd></div><div><dt>{t('Field seen clearly', 'खेत का साफ़ दिखा हिस्सा')}</dt><dd>{field.latestObservation?.valid_coverage_percent != null ? `${field.latestObservation.valid_coverage_percent}%` : t('Not available', 'उपलब्ध नहीं')}</dd></div></dl></details>
            <footer><Link className="action-link" to={fieldActionHref(field)}>{copy.actionLabel}<ArrowRight size={17} aria-hidden="true"/></Link><Link className="card-open" to={`/fields/${field.id}/overview`}>{t('Open field', 'खेत खोलें')}</Link></footer>
          </article>;
        })}</div> : <div className="dashboard-state">
          <span className="empty-field-icon" aria-hidden="true"><Sprout size={36}/></span>
          <h2>{hasFilters ? t('No fields match this view', 'इस खोज में कोई खेत नहीं') : t('Start with your first field', 'अपना पहला खेत जोड़ें')}</h2>
          <p>{hasFilters ? t('Clear the search to see your fields again.', 'अपने खेत फिर देखने के लिए खोज हटाएँ।') : t('Give your field a name and mark its corners on the map. Dates can wait.', 'खेत का नाम दें और नक्शे पर उसके कोने चुनें। तारीख़ें बाद में जोड़ सकते हैं।')}</p>
          {hasFilters ? <button onClick={() => { setQuery(''); setFilter('all'); }}>{t('Clear filters', 'फ़िल्टर हटाएँ')}</button> : <button className="primary-action" onClick={() => setAdding(true)}>{t('Add your first field', 'अपना पहला खेत जोड़ें')}</button>}
          {!hasFilters && fields.some(isDemo) && !includeDemo && <button className="text-button" onClick={() => setIncludeDemo(true)}>{t('Or explore a sample field', 'या नमूना खेत देखकर समझें')}</button>}
        </div>}
      </section>
      <section className="farm-how-it-works" aria-label={t('Three simple steps', 'तीन आसान कदम')}>
        <div><span>1</span><p><strong>{t('Add your field', 'अपना खेत जोड़ें')}</strong>{t('Mark its corners on the map.', 'नक्शे पर खेत के कोने चुनें।')}</p></div>
        <div><span>2</span><p><strong>{t('Check the pictures', 'तस्वीरें देखें')}</strong>{t('See what changed and when.', 'कब और क्या बदला, समझें।')}</p></div>
        <div><span>3</span><p><strong>{t('Visit and keep a note', 'खेत देखें, नोट जोड़ें')}</strong>{t('Record what you see on the ground.', 'खेत में जो दिखे उसे सेव करें।')}</p></div>
      </section>
      <p className="farm-limit-note">{t('Pictures help you spot changes. Only a field visit can help explain the cause.', 'तस्वीरें बदलाव दिखाती हैं। वजह समझने के लिए खेत में जाकर देखें।')} <Link to="/help">{t('How it works', 'कैसे काम करता है')} →</Link></p>
    </>}
    {loading && <div className="dashboard-state" role="status">{t('Loading fields…', 'खेतों की जानकारी ला रहे हैं…')}</div>}
    {adding && <AddFieldWizard onComplete={fieldId => { setAdding(false); navigate(`/fields/${fieldId}/overview`); }} onCancel={() => setAdding(false)}/>}
  </main>;
}
