import { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { GoogleSatelliteMap } from '../../lib/GoogleSatelliteMap';
import { loadFieldAlerts, loadScenes, loadFieldOverlay } from '../../lib/api';

export function FieldMap() {
  const { field } = useOutletContext<{ field: any }>();
  const { fieldId } = useParams();
  const [scenes, setScenes] = useState<any[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string>('');
  const [overlay, setOverlay] = useState<any>(null);
  const [stressGeojson, setStressGeojson] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fieldId) return;
    loadScenes(fieldId).then(data => {
      setScenes(data);
      if (data.length > 0) setActiveSceneId(data[0].scene_id);
    });
    loadFieldAlerts(fieldId).then(alerts => {
      const activeAlert = alerts.find(a => !a.resolved && a.severity === 'high');
      if (activeAlert?.stress_geojson) setStressGeojson(activeAlert.stress_geojson);
    });
  }, [fieldId]);

  useEffect(() => {
    if (!fieldId || !activeSceneId) return;
    setLoading(true);
    loadFieldOverlay(fieldId, activeSceneId).then(data => {
      setOverlay(data);
    }).catch(e => {
      console.error(e);
      setOverlay(null);
    }).finally(() => setLoading(false));
  }, [fieldId, activeSceneId]);

  return (
    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem', background: '#f9fafb', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <label>
          <strong>Select Observation:</strong>
          <select value={activeSceneId} onChange={e => setActiveSceneId(e.target.value)} style={{ marginLeft: '0.5rem' }}>
            {scenes.map(s => (
              <option key={s.scene_id} value={s.scene_id}>
                {new Date(s.observed_at).toLocaleDateString()} (Cloud: {s.cloud_cover}%)
              </option>
            ))}
          </select>
        </label>
        {loading && <span style={{ color: '#4f46e5' }}>Generating overlay...</span>}
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <GoogleSatelliteMap 
          latitude={field.latitude || 28.6139} 
          longitude={field.longitude || 77.2090} 
          stressGeojson={stressGeojson} 
          overlay={overlay} 
        />
        <div style={{ position: 'absolute', bottom: '2rem', right: '1rem', background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>NDVI Legend</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>-0.2</span>
            <div style={{ width: '100px', height: '10px', background: 'linear-gradient(to right, #a50026, #fee08b, #006837)' }}></div>
            <span>1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
