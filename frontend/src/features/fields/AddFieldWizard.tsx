import { useState, useRef, useEffect } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

type Step = 'basic' | 'dates' | 'boundary' | 'confirm';

export function AddFieldWizard({ onComplete, onCancel }: { onComplete: (fieldId: string) => void, onCancel: () => void }) {
  const [step, setStep] = useState<Step>('basic');
  const [name, setName] = useState('');
  const [crop, setCrop] = useState('');
  const [plantingDate, setPlantingDate] = useState('');
  const [harvestDate, setHarvestDate] = useState('');
  
  const [areaHectares, setAreaHectares] = useState(0);
  const [polygonGeojson, setPolygonGeojson] = useState<any>(null);
  const [savedFieldId, setSavedFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [boundaryPoints, setBoundaryPoints] = useState(0);
  const [boundaryFinished, setBoundaryFinished] = useState(false);
  
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const boundaryFinishedRef = useRef(false);
  const boundaryPathRef = useRef<google.maps.LatLngLiteral[]>([]);
  
  const configuredKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const apiKey = configuredKey && !configuredKey.startsWith('your-') ? configuredKey : '';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, saving]);

  useEffect(() => {
    if (step === 'boundary' && apiKey && mapElement.current) {
      let isMounted = true;
      setOptions({ key: apiKey, v: 'weekly' });
      Promise.all([
        importLibrary('maps'),
        importLibrary('geometry')
      ]).then(([maps, geometry]) => {
        if (!isMounted || !mapElement.current) return;
        
        const map = new maps.Map(mapElement.current, {
          center: { lat: 28.6139, lng: 77.2090 }, // Default to India
          zoom: 5,
          mapTypeId: 'satellite'
        });
        mapRef.current = map;

        const polygon = new maps.Polygon({
          map,
          paths: boundaryPathRef.current,
          editable: true,
          fillColor: '#84cc16',
          fillOpacity: 0.25,
          strokeColor: '#cbe86b',
          strokeWeight: 3,
        });
        polygonRef.current = polygon;

        const updateBoundary = () => {
          const path = polygon.getPath();
          setBoundaryPoints(path.getLength());
          boundaryPathRef.current = Array.from({ length: path.getLength() }, (_, index) => {
            const point = path.getAt(index);
            return { lat: point.lat(), lng: point.lng() };
          });
          if (path.getLength() < 3) {
            setPolygonGeojson(null);
            setAreaHectares(0);
            return;
          }
          const coordinates: number[][] = [];
          for (let index = 0; index < path.getLength(); index += 1) {
            const point = path.getAt(index);
            coordinates.push([point.lng(), point.lat()]);
          }
          coordinates.push([...coordinates[0]]);
          setAreaHectares(geometry.spherical.computeArea(path) / 10000);
          setPolygonGeojson({ type: 'Polygon', coordinates: [coordinates] });
        };
        const path = polygon.getPath();
        ['insert_at', 'set_at', 'remove_at'].forEach(eventName =>
          path.addListener(eventName, updateBoundary)
        );
        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (!event.latLng || boundaryFinishedRef.current) return;
          path.push(event.latLng);
        });

        // Try geolocation
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((pos) => {
            if (isMounted) map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            if (isMounted) map.setZoom(14);
          });
        }

      }).catch(() => setError('Google Maps could not be loaded. Check the browser API key and allowed localhost domain.'));
      return () => {
        isMounted = false;
        polygonRef.current?.setMap(null);
        polygonRef.current = null;
        mapRef.current = null;
      };
    }
  }, [step, apiKey]);

  const undoBoundaryPoint = () => {
    const path = polygonRef.current?.getPath();
    if (!path?.getLength()) return;
    boundaryFinishedRef.current = false;
    setBoundaryFinished(false);
    path.pop();
  };

  const clearBoundary = () => {
    boundaryFinishedRef.current = false;
    setBoundaryFinished(false);
    polygonRef.current?.getPath().clear();
  };

  const handleSave = async () => {
    if (!polygonGeojson || saving) return;
    setSaving(true);
    setError('');
    let fieldId = savedFieldId;
    try {
      if (!fieldId) {
        setStatus('Saving field boundary…');
        const response = await fetch('/api/fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            crop,
            planting_date: plantingDate || null,
            harvest_date: harvestDate || null,
            boundary_geojson: polygonGeojson,
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Failed to save field');
        fieldId = payload.id;
        setSavedFieldId(fieldId);
      }

      setStatus('Searching for recent cloud-free Sentinel-2 scenes…');
      const ingestionResponse = await fetch(`/api/fields/${fieldId}/ingest/sentinel-scenes?days=90`, { method: 'POST' });
      const ingestion = await ingestionResponse.json().catch(() => ({}));
      if (!ingestionResponse.ok) throw new Error(ingestion.error || 'Satellite scene search failed');

      const scenesResponse = await fetch(`/api/fields/${fieldId}/scenes`);
      const scenes = await scenesResponse.json().catch(() => []);
      if (!scenesResponse.ok) throw new Error('Unable to load satellite scenes');
      if (!scenes.length) throw new Error('No suitable Sentinel-2 scene was found in the last 90 days');

      setStatus('Calculating crop-health indices from the best scene…');
      const calculationResponse = await fetch(`/api/fields/${fieldId}/ndvi/from-scene/${encodeURIComponent(scenes[0].scene_id)}`, { method: 'POST' });
      const calculation = await calculationResponse.json().catch(() => ({}));
      if (!calculationResponse.ok) throw new Error(calculation.error || 'Crop-health processing failed');

      setStatus('Analysis complete');
      onComplete(fieldId!);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to complete field setup');
      setStatus(fieldId ? 'The field was saved. Retry processing when ready.' : '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wizard-modal" role="presentation">
      <div className="wizard-content" role="dialog" aria-modal="true" aria-labelledby="add-field-title">
        <h2 id="add-field-title">Add new field</h2>
        <p className="step-label">Step {(['basic', 'dates', 'boundary', 'confirm'] as Step[]).indexOf(step) + 1} of 4</p>
        
        {step === 'basic' && (
          <form onSubmit={(e) => { e.preventDefault(); setStep('dates'); }}>
            <label>Field Name <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. North block" /></label>
            <label>Crop Type <input required value={crop} onChange={e => setCrop(e.target.value)} placeholder="e.g. Wheat" /></label>
            <div className="actions">
              <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
              <button type="submit">Next</button>
            </div>
          </form>
        )}

        {step === 'dates' && (
          <form onSubmit={(e) => { e.preventDefault(); setStep('boundary'); }}>
            <label>Planting Date <input type="date" required value={plantingDate} onChange={e => setPlantingDate(e.target.value)} /></label>
            <label>Expected Harvest (Optional) <input type="date" value={harvestDate} onChange={e => setHarvestDate(e.target.value)} /></label>
            <div className="actions">
              <button type="button" onClick={() => setStep('basic')}>Back</button>
              <button type="submit">Next</button>
            </div>
          </form>
        )}

        {step === 'boundary' && (
          <div>
            <p>Click each corner of your field on the map. Add at least three points, then choose <strong>Finish boundary</strong>. You can drag points to correct the shape.</p>
            {!apiKey ? (
               <div style={{ padding: '2rem', background: '#fee2e2', color: '#991b1b' }}>
                 No Google Maps API Key found. A map is required to draw a field.
               </div>
            ) : (
               <div ref={mapElement} style={{ width: '100%', height: '400px', background: '#ccc' }} />
            )}
            {apiKey && (
              <div className="boundary-tools" aria-live="polite">
                <span>{boundaryPoints} point{boundaryPoints === 1 ? '' : 's'} · {areaHectares.toFixed(2)} ha</span>
                <button type="button" onClick={undoBoundaryPoint} disabled={!boundaryPoints}>Undo point</button>
                <button type="button" onClick={clearBoundary} disabled={!boundaryPoints}>Clear</button>
                <button type="button" onClick={() => { boundaryFinishedRef.current = true; setBoundaryFinished(true); }} disabled={boundaryPoints < 3 || boundaryFinished}>
                  {boundaryFinished ? 'Boundary finished' : 'Finish boundary'}
                </button>
              </div>
            )}
            <div className="actions" style={{ marginTop: '1rem' }}>
              <button type="button" onClick={() => setStep('dates')}>Back</button>
              <button type="button" disabled={!polygonGeojson || !boundaryFinished} onClick={() => setStep('confirm')}>Review</button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <h3>Review Field Details</h3>
            <ul>
              <li><strong>Name:</strong> {name}</li>
              <li><strong>Crop:</strong> {crop}</li>
              <li><strong>Planting:</strong> {plantingDate}</li>
              <li><strong>Area:</strong> {areaHectares.toFixed(2)} ha</li>
            </ul>
            <div className="actions">
              <button type="button" onClick={() => setStep('boundary')} disabled={saving || Boolean(savedFieldId)}>Back</button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Processing…' : savedFieldId ? 'Retry Satellite Processing' : 'Save & Analyse Field'}
              </button>
            </div>
            {status && <p className="wizard-status" role="status">{status}</p>}
            {error && <p className="wizard-error" role="alert">{error}</p>}
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .wizard-modal {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000;
          display: flex; align-items: center; justify-content: center;
        }
        .wizard-content {
          background: #1b241b; color: #edf1df; padding: 2rem; border: 1px solid #536b36; border-radius: 8px; width: 100%; max-width: 600px;
        }
        .wizard-content label { display: block; margin-bottom: 1rem; }
        .wizard-content input { display: block; width: 100%; padding: 0.75rem; margin-top: 0.25rem; background:#121812; color:#edf1df; border:1px solid #536b36; border-radius:4px; }
        .wizard-content .actions { display: flex; justify-content: space-between; margin-top: 2rem; }
        .step-label, .wizard-status { color:#cbe86b; }
        .wizard-error { color:#ffb4a2; background:#4b2420; padding:.75rem; border-radius:4px; }
        .wizard-content button { min-height:44px; padding:.65rem 1rem; }
        .wizard-content button:disabled { opacity:.55; cursor:not-allowed; }
        .boundary-tools { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; margin-top:.75rem; color:#cbe86b; font-size:.85rem; }
        .boundary-tools span { margin-right:auto; }
        .boundary-tools button { min-height:36px; padding:.4rem .65rem; background:#27371f; color:#edf1df; border:1px solid #536b36; border-radius:4px; }
      `}} />
    </div>
  );
}
