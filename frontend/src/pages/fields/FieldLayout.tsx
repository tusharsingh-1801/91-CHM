import { useState, useEffect } from 'react';
import { useParams, Outlet, Link, useLocation } from 'react-router-dom';
import { loadFields } from '../../lib/api';

export function FieldLayout() {
  const { fieldId } = useParams();
  const location = useLocation();
  const [field, setField] = useState<any>(null);

  useEffect(() => {
    loadFields().then(data => {
      const current = data.find(f => f.id === fieldId);
      if (current) setField(current);
    });
  }, [fieldId]);

  if (!field) return <div style={{ padding: '2rem' }}>Loading field...</div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1rem' }}>
        <div>
          <Link to="/" style={{ color: '#4b5563', textDecoration: 'none', marginBottom: '0.5rem', display: 'inline-block' }}>&larr; Back to Dashboard</Link>
          <h1 style={{ margin: 0, color: '#111827' }}>{field.name}</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>Crop: {field.crop} | Area: {field.area_hectares} ha</p>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
        <Link to={`/fields/${fieldId}/map`} style={{ fontWeight: location.pathname.includes('/map') ? 'bold' : 'normal', color: '#4d7c0f', textDecoration: 'none' }}>Satellite Map</Link>
        <Link to={`/fields/${fieldId}/analysis`} style={{ fontWeight: location.pathname.includes('/analysis') ? 'bold' : 'normal', color: '#4d7c0f', textDecoration: 'none' }}>Health Analysis</Link>
        <Link to={`/fields/${fieldId}/history`} style={{ fontWeight: location.pathname.includes('/history') ? 'bold' : 'normal', color: '#4d7c0f', textDecoration: 'none' }}>Events & History</Link>
      </div>
      
      <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <Outlet context={{ field }} />
      </div>
    </div>
  );
}
