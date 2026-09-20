import { useState, useRef, useEffect } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

type Step = 'basic' | 'dates' | 'location' | 'boundary' | 'confirm';

export function AddFieldWizard({ onComplete, onCancel }: { onComplete: (fieldId: string) => void, onCancel: () => void }) {
  const [step, setStep] = useState<Step>('basic');
  const [name, setName] = useState('');
  const [crop, setCrop] = useState('');
  const [plantingDate, setPlantingDate] = useState('');
  const [harvestDate, setHarvestDate] = useState('');
  
  const [areaHectares, setAreaHectares] = useState(0);
  const [polygonGeojson, setPolygonGeojson] = useState<any>(null);
  
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const drawingManagerRef = useRef<any>(null);
  
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (step === 'boundary' && apiKey && mapElement.current) {
      let isMounted = true;
      setOptions({ key: apiKey, v: 'weekly' });
      Promise.all([
        importLibrary('maps'), 
        importLibrary('drawing'), 
        importLibrary('geometry')
      ]).then(([maps, drawing, geometry]) => {
        if (!isMounted || !mapElement.current) return;
        
        const map = new maps.Map(mapElement.current, {
          center: { lat: 28.6139, lng: 77.2090 }, // Default to India
          zoom: 5,
          mapTypeId: 'satellite'
        });
        mapRef.current = map;

        const drawingManager = new (drawing as any).DrawingManager({
          drawingMode: (drawing as any).OverlayType.POLYGON,
          drawingControl: true,
          drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [(drawing as any).OverlayType.POLYGON]
          },
          polygonOptions: {
            editable: true,
            fillColor: '#84cc16',
            strokeColor: '#4d7c0f',
            strokeWeight: 2,
          }
        });
        drawingManager.setMap(map);
        drawingManagerRef.current = drawingManager;

        // Try geolocation
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((pos) => {
            if (isMounted) map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            if (isMounted) map.setZoom(14);
          });
        }

        google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon: any) => {
          drawingManager.setDrawingMode(null);
          
          const path = polygon.getPath();
          const areaSqMeters = (geometry as any).spherical.computeArea(path);
          setAreaHectares(areaSqMeters / 10000);

          // Convert to GeoJSON
          const coordinates = [];
          for (let i = 0; i < path.getLength(); i++) {
            const pt = path.getAt(i);
            coordinates.push([pt.lng(), pt.lat()]);
          }
          // Close the polygon
          if (coordinates.length > 0) {
            coordinates.push(coordinates[0]);
          }
          
          setPolygonGeojson({
            type: 'Polygon',
            coordinates: [coordinates]
          });
        });
      });
      return () => { isMounted = false; };
    }
  }, [step, apiKey]);

  const handleSave = async () => {
    try {
      const res = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          crop,
          planting_date: plantingDate || null,
          harvest_date: harvestDate || null,
          boundary_geojson: polygonGeojson,
          area_hectares: areaHectares
        })
      });
      if (!res.ok) throw new Error('Failed to save field');
      const data = await res.json();
      try {
        await fetch(`/api/fields/${data.id}/ingest/sentinel-scenes`, { method: 'POST' });
      } catch (e) {
        console.error('Failed to trigger scan', e);
      }
      onComplete(data.id);
    } catch (err) {
      console.error(err);
      alert('Error saving field');
    }
  };

  return (
    <div className="wizard-modal">
      <div className="wizard-content">
        <h2>Add new field</h2>
        
        {step === 'basic' && (
          <form onSubmit={(e) => { e.preventDefault(); setStep('dates'); }}>
            <label>Field Name <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. North block" /></label>
            <label>Crop Type <input required value={crop} onChange={e => setCrop(e.target.value)} placeholder="e.g. Wheat" /></label>
            <div className="actions">
              <button type="button" onClick={onCancel}>Cancel</button>
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
            <p>Draw your field boundary. Polygon must be closed.</p>
            {!apiKey ? (
               <div style={{ padding: '2rem', background: '#fee2e2', color: '#991b1b' }}>
                 No Google Maps API Key found. A map is required to draw a field.
               </div>
            ) : (
               <div ref={mapElement} style={{ width: '100%', height: '400px', background: '#ccc' }} />
            )}
            <div className="actions" style={{ marginTop: '1rem' }}>
              <button type="button" onClick={() => setStep('dates')}>Back</button>
              <button type="button" disabled={!polygonGeojson} onClick={() => setStep('confirm')}>Review</button>
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
              <button type="button" onClick={() => setStep('boundary')}>Back</button>
              <button type="button" onClick={handleSave}>Save & Request Scan</button>
            </div>
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .wizard-modal {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000;
          display: flex; align-items: center; justify-content: center;
        }
        .wizard-content {
          background: #fff; color: #1f2937; padding: 2rem; border-radius: 8px; width: 100%; max-width: 600px;
        }
        .wizard-content label { display: block; margin-bottom: 1rem; }
        .wizard-content input { display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem; }
        .wizard-content .actions { display: flex; justify-content: space-between; margin-top: 2rem; }
      `}} />
    </div>
  );
}
