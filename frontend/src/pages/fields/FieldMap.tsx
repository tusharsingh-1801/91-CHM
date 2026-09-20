import { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { GoogleSatelliteMap } from '../../lib/GoogleSatelliteMap';
import { calculateNdvi, ingestSentinelScenes, loadFieldAlerts, loadScenes } from '../../lib/api';

export function FieldMap() {
  const { field } = useOutletContext<{ field: any }>();
  const { fieldId } = useParams();
  const [scenes, setScenes] = useState<any[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string>('');
  const [stressGeojson, setStressGeojson] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshScenes = useCallback(async () => {
    if (!fieldId) return [];
    const data = await loadScenes(fieldId);
    setScenes(data);
    setActiveSceneId(current => current && data.some(scene => scene.scene_id === current) ? current : data[0]?.scene_id || '');
    return data;
  }, [fieldId]);

  useEffect(() => {
    if (!fieldId) return;
    loadScenes(fieldId).then(data => {
      setScenes(data);
      setActiveSceneId(data[0]?.scene_id || '');
    }).catch(() => setError('Unable to load satellite observations.'));
    loadFieldAlerts(fieldId).then(alerts => {
      const activeAlert = alerts.find(a => !a.resolved && a.severity === 'high');
      if (activeAlert?.stress_geojson) setStressGeojson(activeAlert.stress_geojson);
    }).catch(() => setError('Unable to load field alerts.'));
  }, [fieldId]);

  const tileUrl = fieldId && activeSceneId
    ? `/api/fields/${fieldId}/tiles/${activeSceneId}/{z}/{x}/{y}.png`
    : null;

  const processLatestScene = async () => {
    if (!fieldId || processing) return;
    setProcessing(true);
    setError('');
    setMessage('Searching for recent Sentinel-2 observations…');
    try {
      await ingestSentinelScenes(fieldId);
      const availableScenes = await refreshScenes();
      const sceneId = availableScenes[0]?.scene_id;
      if (!sceneId) throw new Error('No suitable Sentinel-2 observation was found in the last 90 days.');
      setActiveSceneId(sceneId);
      setMessage('Calculating NDVI, NDRE, NDMI, SAVI and EVI…');
      const result = await calculateNdvi(fieldId, sceneId);
      setMessage(`Analysis complete. NDVI ${result.ndvi.toFixed(3)} with ${result.validCoverage.toFixed(1)}% valid coverage.`);
    } catch (caught) {
      setMessage('');
      setError(caught instanceof Error ? caught.message : 'Satellite processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  const hasLocation = Number.isFinite(Number(field.latitude)) && Number.isFinite(Number(field.longitude));

  return (
    <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem', background: '#f9fafb', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <label>
          <strong>Select Observation:</strong>
          <select value={activeSceneId} onChange={e => setActiveSceneId(e.target.value)} style={{ marginLeft: '0.5rem' }}>
            {!scenes.length && <option value="">No observations available</option>}
            {scenes.map(s => (
              <option key={s.scene_id} value={s.scene_id}>
                {new Date(s.observed_at).toLocaleDateString()} (Cloud: {s.cloud_cover}%)
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={processLatestScene} disabled={processing} style={{ minHeight: '44px', padding: '0.65rem 1rem', background: '#4d7c0f', color: 'white', border: 0, borderRadius: '6px' }}>
          {processing ? 'Processing…' : 'Find & Process Latest Scene'}
        </button>
      </div>
      {message && <div role="status" style={{ padding: '.75rem 1rem', background: '#ecfccb', color: '#365314' }}>{message}</div>}
      {error && <div role="alert" style={{ padding: '.75rem 1rem', background: '#fee2e2', color: '#991b1b' }}>{error}</div>}
      <div style={{ flex: 1, position: 'relative' }}>
        {hasLocation ? (
          <GoogleSatelliteMap
            latitude={Number(field.latitude)}
            longitude={Number(field.longitude)}
            fieldName={field.name}
            boundaryGeojson={field.boundary_geojson}
            stressGeojson={stressGeojson}
            tileUrl={tileUrl}
          />
        ) : (
          <div role="alert" style={{ padding: '2rem' }}>This field has no valid location or boundary. Edit the field before requesting satellite analysis.</div>
        )}
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
