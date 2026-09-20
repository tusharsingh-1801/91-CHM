import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { loadFields } from '../../lib/api';
import { AddFieldWizard } from '../../features/fields/AddFieldWizard';

export function Dashboard() {
  const [fields, setFields] = useState<any[]>([]);
  const [modal, setModal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshFields = () => {
    setLoading(true);
    setError('');
    loadFields()
      .then(setFields)
      .catch(() => setError('TerraScope could not load fields. Check the API and database services, then retry.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    loadFields()
      .then(data => { if (!cancelled) setFields(data); })
      .catch(() => { if (!cancelled) setError('TerraScope could not load fields. Check the API and database services, then retry.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const averageHealth = fields.length ? Math.round(fields.reduce((sum, field) => sum + Number(field.health_score || 0), 0) / fields.length) : 0;
  const averageNdvi = fields.length ? fields.reduce((sum, field) => sum + Number(field.ndvi_average || 0), 0) / fields.length : 0;
  const monitoredArea = fields.reduce((sum, field) => sum + Number(field.area_hectares || 0), 0);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">SATELLITE CROP INTELLIGENCE</span>
          <h1>Terra<span>Scope</span></h1>
          <p>Understand field health from Sentinel-2 imagery and weather observations.</p>
        </div>
        <button className="primary-action" onClick={() => setModal('add')}>+ Add field</button>
      </header>

      {error && <div className="service-error" role="alert"><strong>Service unavailable</strong><span>{error}</span><button onClick={refreshFields}>Retry</button></div>}

      {!error && !loading && fields.length > 0 && (
        <section className="summary-grid" aria-label="Farm summary">
          <article><span>Fields</span><strong>{fields.length}</strong><small>actively monitored</small></article>
          <article><span>Average health</span><strong>{averageHealth}<em>/100</em></strong><small>experimental indicator</small></article>
          <article><span>Average NDVI</span><strong>{averageNdvi.toFixed(3)}</strong><small>latest field values</small></article>
          <article><span>Monitored area</span><strong>{monitoredArea.toFixed(1)}<em> ha</em></strong><small>boundary-derived</small></article>
        </section>
      )}

      {loading ? (
        <div className="dashboard-state" role="status">Loading fields…</div>
      ) : !error && fields.length === 0 ? (
        <div className="dashboard-state">
          <span className="empty-icon">◇</span>
          <h2>No fields added yet</h2>
          <p>Add your first field, draw its boundary and TerraScope will search for a recent Sentinel-2 observation.</p>
          <button className="primary-action" onClick={() => setModal('add')}>Add your first field</button>
        </div>
      ) : !error ? (
        <section>
          <div className="section-heading"><div><span className="eyebrow">YOUR LAND</span><h2>Monitored fields</h2></div><span>{fields.length} total</span></div>
        <div className="field-grid">
          {fields.map(field => (
            <Link key={field.id} to={`/fields/${field.id}/map`} className="field-card">
                <div className="field-card-top"><div><span className="field-status"></span><small>{field.crop}</small><h3>{field.name}</h3></div><span className="card-arrow">↗</span></div>
                <div className="field-metrics">
                  <div><span>Health</span><strong>{field.last_observation ? `${field.health_score}/100` : 'Pending'}</strong></div>
                  <div><span>NDVI</span><strong>{field.last_observation ? Number(field.ndvi_average).toFixed(3) : '—'}</strong></div>
                  <div><span>Area</span><strong>{field.area_hectares} ha</strong></div>
                </div>
                <footer>{field.last_observation ? `Observed ${new Date(field.last_observation).toLocaleDateString()}` : 'Awaiting first successful observation'}</footer>
            </Link>
          ))}
        </div>
        </section>
      ) : null}

      {modal === 'add' && (
        <AddFieldWizard 
          onComplete={() => { setModal(''); refreshFields(); }} 
          onCancel={() => setModal('')} 
        />
      )}
    </main>
  );
}
