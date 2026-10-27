import { useState, useEffect, useCallback } from 'react';
import { Activity, BookOpen, FileText, MapPinned, LayoutDashboard, ArrowLeft } from 'lucide-react';
import { useParams, Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useModalDialog } from '../../lib/useModalDialog';
import { deleteField, loadFields, updateField, updateFieldBoundary, type DatabaseField } from '../../lib/api';
import { usePreferences } from '../../lib/preferencesContext';
import { fieldCopy } from '../../lib/fieldCopy';
import { FieldBoundaryEditor } from '../../features/fields/FieldBoundaryEditor';
import { polygonAreaHectares, validatePolygonBoundary, type PolygonBoundary } from '../../features/fields/boundary';

export function FieldLayout() {
  const { fieldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language, date, area } = usePreferences();
  const [field, setField] = useState<DatabaseField | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(false);
  const [editedBoundary, setEditedBoundary] = useState<PolygonBoundary | null>(null);
  const [boundarySaving, setBoundarySaving] = useState(false);
  const [boundaryError, setBoundaryError] = useState(false);
  const [boundaryStatus, setBoundaryStatus] = useState(false);
  useModalDialog(editing, () => setEditing(false), saving || boundarySaving);
  const refreshField = useCallback(async () => {
    setError(false);
    try {
      const current = (await loadFields()).find(item => item.id === fieldId);
      if (!current) throw new Error('Field not found');
      setField(current);
    } catch { setError(true); }
  }, [fieldId]);
  useEffect(() => {
    let cancelled = false;
    loadFields().then(data => { if (!cancelled) { const current = data.find(item => item.id === fieldId); if (current) setField(current); else setError(true); } }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [fieldId]);
  if (error) return <main className="dashboard-shell"><div className="service-error" role="alert"><Link to="/">{t('Back to Dashboard', 'मेरे खेतों पर वापस जाएँ')}</Link><strong>{t('Unable to open field', 'खेत की जानकारी नहीं खुली')}</strong><span>{t('Check your connection and retry. This field may have been removed or you may not have access.', 'कनेक्शन देखकर फिर कोशिश करें। हो सकता है खेत हट गया हो या आपको इसकी अनुमति न हो।')}</span><button onClick={() => void refreshField()}>{t('Retry', 'फिर कोशिश करें')}</button></div></main>;
  if (!field || field.id !== fieldId) return <main className="dashboard-shell" role="status">{t('Loading field…', 'खेत की जानकारी ला रहे हैं…')}</main>;
  const copy = fieldCopy(field, language);
  const isOverview = location.pathname.endsWith('/overview') || location.pathname.endsWith(field.id);
  const busy = saving || boundarySaving;
  return <main className="field-shell">
    <header className="field-header no-print"><div><Link to="/" className="back-link"><ArrowLeft size={16} aria-hidden="true"/>  {t('Back to Dashboard', 'मेरे खेतों पर वापस जाएँ')}</Link><h1>{field.name}</h1><p>{!field.crop || field.crop === 'Unknown' ? t('Crop unknown', 'फ़सल अज्ञात') : field.crop} · {area(field.area_hectares)}</p></div><button type="button" className="secondary-action" onClick={() => { setFormError(false); setBoundaryError(false); setBoundaryStatus(false); setEditedBoundary(validatePolygonBoundary(field.boundary_geojson) ? field.boundary_geojson : null); setEditing(true); }}>{t('Manage field', 'खेत की जानकारी बदलें')}</button></header>
    <nav className="field-tabs no-print" aria-label={t('Field sections', 'खेत के पेज')}>
      <NavLink to={`/fields/${fieldId}/overview`}><LayoutDashboard size={17} aria-hidden="true"/>{t('Overview', 'एक नज़र')}</NavLink><NavLink to={`/fields/${fieldId}/map`}><MapPinned size={17} aria-hidden="true"/>{t('Field map', 'खेत का नक्शा')}</NavLink><NavLink to={`/fields/${fieldId}/analysis`}><Activity size={17} aria-hidden="true"/>{t('Changes over time', 'समय के साथ बदलाव')}</NavLink><NavLink to={`/fields/${fieldId}/history`}><BookOpen size={17} aria-hidden="true"/>{t('Field diary', 'खेत की डायरी')}</NavLink><NavLink to={`/fields/${fieldId}/report`}><FileText size={17} aria-hidden="true"/>{t('Report', 'रिपोर्ट')}</NavLink>
    </nav>
    {!isOverview && <section className="field-evidence no-print" aria-label={t('Field evidence', 'खेत की जानकारी')}><div><span className={`evidence-status status-${copy.assessment.state}`}>{copy.title}</span><p>{copy.explanation}</p></div><details><summary>{t('Latest image details', 'पिछली तस्वीर की जानकारी')}</summary><dl className="evidence-facts"><div><dt>{t('Satellite image', 'Satellite तस्वीर')}</dt><dd>{date(field.latestObservation?.observed_on)}</dd></div><div><dt>{t('Field visible clearly', 'खेत का साफ़ दिखा हिस्सा')}</dt><dd>{field.latestObservation?.valid_coverage_percent != null ? `${field.latestObservation.valid_coverage_percent}%` : t('Not available', 'उपलब्ध नहीं')}</dd></div><div><dt>{t('Source', 'स्रोत')}</dt><dd>{field.latestObservation?.source || t('No verified satellite evidence', 'Satellite जानकारी अभी सत्यापित नहीं')}</dd></div></dl></details></section>}
    <div className="field-content"><Outlet key={field.id} context={{ field, refreshField }}/></div>
    {editing && <div className="wizard-modal" role="presentation"><form className="wizard-content" role="dialog" aria-modal="true" aria-labelledby="manage-field-title" onSubmit={async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setFormError(false);
      try { await updateField(field.id, { name: String(form.get('name') || ''), crop: String(form.get('crop') || ''), planting_date: String(form.get('planting_date') || '') || null, harvest_date: String(form.get('harvest_date') || '') || null, expected_yield_tons: form.get('expected_yield_tons') ? Number(form.get('expected_yield_tons')) : null }); await refreshField(); setEditing(false); }
      catch { setFormError(true); } finally { setSaving(false); }
    }}><h2 id="manage-field-title">{t('Manage field', 'खेत की जानकारी बदलें')}</h2>
      <label>{t('Name', 'खेत का नाम')}<input name="name" defaultValue={field.name} required maxLength={160}/></label><label>{t('Crop', 'फ़सल')}<input name="crop" defaultValue={field.crop} required maxLength={100}/></label><label>{t('Planting date', 'बुवाई की तारीख़')}<input name="planting_date" type="date" defaultValue={field.planting_date?.slice(0, 10) ?? ''}/></label><label>{t('Expected harvest', 'कटाई की अनुमानित तारीख़')}<input name="harvest_date" type="date" defaultValue={field.harvest_date?.slice(0, 10) ?? ''}/></label><label>{t('Expected yield (tons)', 'अनुमानित उपज (टन)')}<input name="expected_yield_tons" type="number" min="0" step="0.01" defaultValue={field.expected_yield_tons ?? ''}/></label>
      {formError && <p className="wizard-error" role="alert">{t('Changes could not be saved. Check the dates and your connection, then retry.', 'बदलाव सेव नहीं हुए। तारीख़ें और कनेक्शन देखकर दोबारा कोशिश करें।')}</p>}
      <div className="actions"><button type="button" onClick={() => setEditing(false)} disabled={busy}>{t('Cancel', 'रद्द करें')}</button><button type="submit" disabled={busy}>{saving ? t('Saving…', 'सेव कर रहे हैं…') : t('Save changes', 'बदलाव सेव करें')}</button></div>
      <details className="boundary-edit"><summary>{t('Edit field boundary', 'खेत की सीमा बदलें')}</summary><p>{t('Drag the corners to adjust your field. After saving a new boundary, check satellite images again. Earlier images remain in history.', 'कोने खींचकर खेत की सीमा बदलें। नई सीमा सेव करने के बाद satellite तस्वीरें फिर जाँचें। पुरानी तस्वीरें इतिहास में रहेंगी।')}</p><FieldBoundaryEditor boundary={editedBoundary} onChange={setEditedBoundary}/><p>{area(polygonAreaHectares(editedBoundary))} · {t('One field outline per record', 'एक रिकॉर्ड में एक खेत की सीमा')}</p>
        {boundaryError && <p role="alert">{t('Boundary could not be saved. Your previous boundary is unchanged.', 'सीमा सेव नहीं हुई। पिछली सीमा सुरक्षित है।')}</p>}{boundaryStatus && <p role="status">{t('New boundary saved. Check for an image for this outline.', 'नई सीमा सेव हो गई। इस सीमा की satellite तस्वीर जाँचें।')}</p>}
        <button type="button" disabled={busy || !validatePolygonBoundary(editedBoundary) || polygonAreaHectares(editedBoundary) <= 0 || polygonAreaHectares(editedBoundary) > 10000} onClick={async () => { if (!editedBoundary) return; setBoundarySaving(true); setBoundaryError(false); setBoundaryStatus(false); try { await updateFieldBoundary(field.id, editedBoundary); await refreshField(); setBoundaryStatus(true); } catch { setBoundaryError(true); } finally { setBoundarySaving(false); } }}>{boundarySaving ? t('Saving boundary…', 'सीमा सेव कर रहे हैं…') : t('Save new boundary version', 'नई सीमा सेव करें')}</button>
      </details>
      <button className="danger-action" type="button" disabled={busy} onClick={async () => { if (!window.confirm(t(`Delete ${field.name} and all its observations? This cannot be undone.`, `${field.name} और उसकी सारी जानकारी हटाएँ? इसे वापस नहीं लाया जा सकेगा।`))) return; setSaving(true); setFormError(false); try { await deleteField(field.id); navigate('/'); } catch { setFormError(true); setSaving(false); } }}>{t('Delete field', 'खेत हटाएँ')}</button>
    </form></div>}
  </main>;
}
