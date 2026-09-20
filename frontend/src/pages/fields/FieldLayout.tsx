import { useState, useEffect, useCallback } from 'react';
import { useParams, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { deleteField, loadFields, updateField } from '../../lib/api';

export function FieldLayout() {
  const { fieldId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [field, setField] = useState<any>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const refreshField = useCallback(async () => {
    setError('');
    try {
      const data = await loadFields();
      const current = data.find(f => f.id === fieldId);
      if (!current) throw new Error('Field not found');
      setField(current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load field');
    }
  }, [fieldId]);

  useEffect(() => {
    let cancelled = false;
    loadFields().then(data => {
      if (cancelled) return;
      const current = data.find(item => item.id === fieldId);
      if (current) setField(current); else setError('Field not found');
    }).catch(() => { if (!cancelled) setError('Unable to load field'); });
    return () => { cancelled = true; };
  }, [fieldId]);

  if (error) return <div className="dashboard-shell"><div className="service-error" role="alert"><strong>Unable to open field</strong><span>{error}</span><button onClick={refreshField}>Retry</button></div></div>;
  if (!field) return <div style={{ padding: '2rem' }}>Loading field...</div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #303a2d', paddingBottom: '1rem', marginBottom: '1rem' }}>
        <div>
          <Link to="/" style={{ color: '#a5b287', textDecoration: 'none', marginBottom: '0.5rem', display: 'inline-block' }}>&larr; Back to Dashboard</Link>
          <h1 style={{ margin: 0, color: '#edf1df' }}>{field.name}</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#8e9986' }}>Crop: {field.crop} | Area: {field.area_hectares} ha</p>
        </div>
        <button type="button" onClick={() => { setFormError(''); setEditing(true); }} style={{ minHeight:'42px', padding:'.6rem 1rem', border:'1px solid #536b36', background:'#27371f', color:'#d9ea92', borderRadius:'4px' }}>Manage field</button>
      </div>
      
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
        <Link to={`/fields/${fieldId}/map`} style={{ fontWeight: location.pathname.includes('/map') ? 'bold' : 'normal', color: '#4d7c0f', textDecoration: 'none' }}>Satellite Map</Link>
        <Link to={`/fields/${fieldId}/analysis`} style={{ fontWeight: location.pathname.includes('/analysis') ? 'bold' : 'normal', color: '#4d7c0f', textDecoration: 'none' }}>Health Analysis</Link>
        <Link to={`/fields/${fieldId}/history`} style={{ fontWeight: location.pathname.includes('/history') ? 'bold' : 'normal', color: '#4d7c0f', textDecoration: 'none' }}>Events & History</Link>
      </div>
      
      <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <Outlet context={{ field, refreshField }} />
      </div>
      {editing && (
        <div className="wizard-modal" role="presentation">
          <form className="wizard-content" role="dialog" aria-modal="true" aria-labelledby="manage-field-title" onSubmit={async event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setSaving(true); setFormError('');
            try {
              await updateField(field.id, {
                name: String(form.get('name') || ''), crop: String(form.get('crop') || ''),
                planting_date: String(form.get('planting_date') || '') || null,
                harvest_date: String(form.get('harvest_date') || '') || null,
                expected_yield_tons: form.get('expected_yield_tons') ? Number(form.get('expected_yield_tons')) : null,
              });
              await refreshField(); setEditing(false);
            } catch (caught) { setFormError(caught instanceof Error ? caught.message : 'Unable to update field'); }
            finally { setSaving(false); }
          }}>
            <h2 id="manage-field-title">Manage field</h2>
            <label>Name<input name="name" defaultValue={field.name} required /></label>
            <label>Crop<input name="crop" defaultValue={field.crop} required /></label>
            <label>Planting date<input name="planting_date" type="date" defaultValue={field.planting_date?.slice(0,10) ?? ''} /></label>
            <label>Expected harvest<input name="harvest_date" type="date" defaultValue={field.harvest_date?.slice(0,10) ?? ''} /></label>
            <label>Expected yield (tons)<input name="expected_yield_tons" type="number" min="0" step="0.01" defaultValue={field.expected_yield_tons ?? ''} /></label>
            {formError && <p className="wizard-error" role="alert">{formError}</p>}
            <div className="actions"><button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
            <button type="button" disabled={saving} onClick={async () => {
              if (!window.confirm(`Delete ${field.name} and all its observations? This cannot be undone.`)) return;
              setSaving(true); setFormError('');
              try { await deleteField(field.id); navigate('/'); }
              catch (caught) { setFormError(caught instanceof Error ? caught.message : 'Unable to delete field'); setSaving(false); }
            }} style={{ marginTop:'1.5rem', width:'100%', color:'#ffb4a2', background:'#4b2420', border:'1px solid #7f3b32', borderRadius:'4px' }}>Delete field</button>
          </form>
        </div>
      )}
    </div>
  );
}
