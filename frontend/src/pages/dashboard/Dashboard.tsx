import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { loadFields } from '../../lib/api';
import { AddFieldWizard } from '../../features/fields/AddFieldWizard';

export function Dashboard() {
  const [fields, setFields] = useState<any[]>([]);
  const [modal, setModal] = useState<string>('');

  const refreshFields = () => {
    loadFields().then(setFields).catch(console.error);
  };

  useEffect(() => {
    refreshFields();
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            TerraScope
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>Crop Health Monitoring Dashboard</p>
        </div>
        <button 
          onClick={() => setModal('add')} 
          style={{ background: '#4d7c0f', color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
        >
          + Add Field
        </button>
      </header>

      {fields.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: '#f9fafb', borderRadius: '8px' }}>
          <h3 style={{ color: '#374151' }}>No fields added yet</h3>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Add your first field to start monitoring crop health.</p>
          <button onClick={() => setModal('add')} style={{ background: '#4d7c0f', color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
            Add Field
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {fields.map(field => (
            <Link key={field.id} to={`/fields/${field.id}/map`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#111827' }}>{field.name}</h3>
                <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.875rem' }}>{field.crop} &middot; {field.area_hectares} ha</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Health Score</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: field.health_score > 80 ? '#15803d' : field.health_score > 60 ? '#b45309' : '#b91c1c' }}>
                      {field.health_score}/100
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>Last Scan</span>
                    <div style={{ fontWeight: '500' }}>
                      {field.last_observation ? new Date(field.last_observation).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {modal === 'add' && (
        <AddFieldWizard 
          onComplete={() => { setModal(''); refreshFields(); }} 
          onCancel={() => setModal('')} 
        />
      )}
    </div>
  );
}
