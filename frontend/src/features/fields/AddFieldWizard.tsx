import { useState } from 'react';
import { useModalDialog } from '../../lib/useModalDialog';
import { queueFieldJob } from '../../lib/api';
import { usePreferences } from '../../lib/preferencesContext';
import { FieldBoundaryEditor } from './FieldBoundaryEditor';
import { FieldLocationSearch } from './FieldLocationSearch';
import { polygonAreaHectares, validatePolygonBoundary, type PolygonBoundary } from './boundary';

type Step = 'basic' | 'dates' | 'boundary' | 'confirm';

export function AddFieldWizard({ onComplete, onCancel }: { onComplete: (fieldId: string) => void, onCancel: () => void }) {
  const { t, area, date } = usePreferences();
  const [step, setStep] = useState<Step>('basic');
  const [name, setName] = useState('');
  const [crop, setCrop] = useState('');
  const [plantingDate, setPlantingDate] = useState('');
  const [harvestDate, setHarvestDate] = useState('');
  
  const [polygonGeojson, setPolygonGeojson] = useState<PolygonBoundary|null>(null);
  const [focusLocation,setFocusLocation]=useState<{latitude:number;longitude:number}|null>(null);
  const [savedFieldId, setSavedFieldId] = useState<string | null>(null);
  const [clientKey] = useState(()=>crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [boundaryFinished, setBoundaryFinished] = useState(false);
  const [importError,setImportError]=useState('');
  const areaHectares=polygonAreaHectares(polygonGeojson);
  const outerRing=polygonGeojson?.coordinates[0]??[];
  const boundaryPoints=outerRing.length>1&&outerRing[0][0]===outerRing.at(-1)?.[0]&&outerRing[0][1]===outerRing.at(-1)?.[1]?outerRing.length-1:outerRing.length;
  
  const closeWizard = () => savedFieldId ? onComplete(savedFieldId) : onCancel();

  useModalDialog(true, closeWizard, saving);

  const undoBoundaryPoint = () => {
    if(!polygonGeojson||!boundaryPoints)return;
    const open=outerRing.slice(0,boundaryPoints);
    open.pop();
    if(open.length>=3)open.push([...open[0]]);
    setPolygonGeojson({...polygonGeojson,coordinates:[open,...polygonGeojson.coordinates.slice(1)]});
    setBoundaryFinished(false);
  };

  const clearBoundary = () => {
    setBoundaryFinished(false);
    setPolygonGeojson(null);
    setImportError('');
  };

  const importBoundary=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];if(!file)return;
    setImportError('');
    try{
      if(file.size>120*1024)throw new Error('GeoJSON files must be smaller than 120 KB to fit the API boundary limit.');
      const parsed=JSON.parse(await file.text()) as {type?:string;geometry?:unknown;features?:Array<{geometry?:unknown}>};
      const geometry=parsed.type==='Feature'?parsed.geometry:parsed.type==='FeatureCollection'&&parsed.features?.length===1?parsed.features[0].geometry:parsed;
      if(geometry&&typeof geometry==='object'&&(geometry as {type?:string}).type==='MultiPolygon'){
        throw new Error('This service supports one Polygon per field. MultiPolygon imports are not supported; split the parcel into separate fields.');
      }
      if(!validatePolygonBoundary(geometry))throw new Error('Choose a valid GeoJSON Polygon with closed rings and WGS84 [longitude, latitude] coordinates. FeatureCollections must contain exactly one Polygon.');
      const area=polygonAreaHectares(geometry);
      if(!Number.isFinite(area)||area<=0||area>10000)throw new Error('The Polygon area must be greater than zero and no more than 10,000 hectares.');
      setPolygonGeojson(geometry);setBoundaryFinished(false);
    }catch(caught){setImportError(caught instanceof Error?caught.message:'Unable to read this GeoJSON file.');}
    finally{event.target.value='';}
  };

  const handleSave = async () => {
    if (!polygonGeojson || saving) return;
    setSaving(true);
    setError('');
    let fieldId = savedFieldId;
    try {
      if (!fieldId) {
        setStatus(t('Saving field boundary…', 'खेत की सीमा सेव कर रहे हैं…'));
        const response = await fetch('/api/fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json','Idempotency-Key':clientKey },
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
        if (typeof payload.id !== 'string' || !payload.id) throw new Error('The field was saved, but its ID could not be confirmed. Contact support before trying again.');
        fieldId = payload.id;
        setSavedFieldId(fieldId);
      }

      setStatus(t('Field saved. Starting an image check…', 'खेत सेव हो गया। तस्वीर की जाँच शुरू कर रहे हैं…'));
      if (!fieldId) throw new Error('Field ID unavailable');
      await queueFieldJob(fieldId);
      onComplete(fieldId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to complete field setup');
      setStatus(fieldId ? t('Your field is saved. Retry the image check or open the field now.', 'आपका खेत सेव है। तस्वीर की जाँच दोबारा शुरू करें या खेत खोलें।') : '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wizard-modal" role="presentation">
      <div className="wizard-content" role="dialog" aria-modal="true" aria-labelledby="add-field-title">
        <button type="button" onClick={closeWizard} disabled={saving} aria-label={t('Close add field', 'खेत जोड़ना बंद करें')} style={{ float: 'right' }}>{t('Close', 'बंद करें')}</button>
        <h2 id="add-field-title">{t('Add new field', 'नया खेत जोड़ें')}</h2>
        <p className="step-label">{t('Step', 'चरण')} {(['basic', 'dates', 'boundary', 'confirm'] as Step[]).indexOf(step) + 1} {t('of 4', '/ 4')}</p>
        
        {step === 'basic' && (
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && crop.trim()) setStep('dates'); else setError('Field name and crop are required.'); }}>
            <label>{t('Field Name', 'खेत का नाम')} <input required value={name} onChange={e => setName(e.target.value)} placeholder={t('e.g. North block', 'जैसे: पूरब वाला खेत')} /></label>
            <label>{t('Crop Type', 'फ़सल')} <input required value={crop} onChange={e => setCrop(e.target.value)} placeholder={t('e.g. Wheat', 'जैसे: गेहूँ')} /></label>
            <div className="actions">
              <button type="button" onClick={onCancel} disabled={saving}>{t('Cancel', 'रद्द करें')}</button>
              <button type="submit">{t('Next', 'आगे')}</button>
            </div>
          </form>
        )}

        {step === 'dates' && (
          <form onSubmit={(e) => { e.preventDefault(); if (plantingDate && harvestDate && harvestDate < plantingDate) { setError('Harvest date must be on or after planting date.'); return; } setError(''); setStep('boundary'); }}>
            <label>{t('Planting Date (Optional)', 'बुवाई की तारीख़ (ज़रूरी नहीं)')} <input type="date" value={plantingDate} onChange={e => setPlantingDate(e.target.value)} /></label>
            <label>{t('Expected Harvest (Optional)', 'कटाई की अनुमानित तारीख़ (ज़रूरी नहीं)')} <input type="date" min={plantingDate || undefined} value={harvestDate} onChange={e => setHarvestDate(e.target.value)} /></label>
            <p>{t("Don’t know the dates? Leave them blank and continue.", "तारीख़ें नहीं पता? खाली छोड़कर आगे बढ़ें।")}</p>
            <div className="actions">
              <button type="button" onClick={() => setStep('basic')}>{t('Back', 'पीछे')}</button>
              <button type="submit">{t('Next', 'आगे')}</button>
            </div>
          </form>
        )}

        {step === 'boundary' && (
          <div>
            <p>{t('Search for your village, zoom in on the field, then tap each corner clockwise. You can also pan the map until the crosshair is on a corner and use Add corner at crosshair. Drag a numbered point to adjust it.', 'गाँव खोजें, खेत पर ज़ूम करें और हर कोने को घड़ी की दिशा में चुनें। नक्शे को खिसकाकर बीच का निशान कोने पर रखें और “बीच के निशान पर कोना जोड़ें” दबाएँ। कोना ठीक करने के लिए नंबर वाले बिंदु को खींचें।')}</p>
            <FieldLocationSearch onSelect={({latitude,longitude})=>setFocusLocation({latitude,longitude})}/>
            <FieldBoundaryEditor boundary={polygonGeojson} onChange={boundary=>{setPolygonGeojson(boundary);setImportError('');}} boundaryFinished={boundaryFinished} focusLocation={focusLocation}/>
            <div className="boundary-tools" aria-live="polite">
              <span>{boundaryPoints} {t(boundaryPoints === 1 ? 'point' : 'points', 'कोने')} · {area(areaHectares)}</span>
              <button type="button" onClick={undoBoundaryPoint} disabled={!boundaryPoints}>{t('Undo point', 'पिछला कोना हटाएँ')}</button>
              <button type="button" onClick={clearBoundary} disabled={!boundaryPoints}>{t('Clear', 'साफ़ करें')}</button>
              <button type="button" onClick={() => setBoundaryFinished(true)} disabled={boundaryPoints < 3 || boundaryFinished}>
                {boundaryFinished ? t('Boundary finished', 'सीमा पूरी हो गई') : t('Finish boundary', 'सीमा पूरी करें')}
              </button>
            </div>
            <details className="boundary-import"><summary>{t('Already have a field outline file? (Optional)', 'खेत की सीमा की फ़ाइल पहले से है? (ज़रूरी नहीं)')}</summary><label>{t('Import GeoJSON Polygon', 'GeoJSON फ़ाइल से सीमा जोड़ें')}<input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={importBoundary}/></label>
            <p>{t('Optional: import a GeoJSON file containing one field outline. Multiple separate outlines must be added as separate fields.', 'वैकल्पिक: एक खेत की सीमा वाली GeoJSON फ़ाइल जोड़ें। अलग-अलग सीमाओं को अलग खेत के रूप में जोड़ें।')}</p>
            {importError&&<div role="alert"><p>{t('This boundary file could not be imported. Use one valid GeoJSON Polygon under 120 KB.', 'सीमा की फ़ाइल नहीं खुली। 120 KB से छोटी, एक सही GeoJSON Polygon वाली फ़ाइल चुनें।')}</p><details><summary>{t('Technical details', 'तकनीकी जानकारी')}</summary>{importError}</details></div>}</details>
            <div className="actions" style={{ marginTop: '1rem' }}>
              <button type="button" onClick={() => setStep('dates')}>{t('Back', 'पीछे')}</button>
              <button type="button" disabled={!polygonGeojson || !validatePolygonBoundary(polygonGeojson) || !boundaryFinished || areaHectares<=0 || areaHectares>10000} onClick={() => setStep('confirm')}>{t('Review', 'जानकारी देखें')}</button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <h3>{t('Review Field Details', 'खेत की जानकारी जाँचें')}</h3>
            <ul>
              <li><strong>{t('Name:', 'नाम:')}</strong> {name}</li>
              <li><strong>{t('Crop:', 'फ़सल:')}</strong> {crop}</li>
              <li><strong>{t('Planting:', 'बुवाई:')}</strong> {plantingDate ? date(plantingDate) : t('Unknown', 'पता नहीं')}</li>
              <li><strong>{t('Expected harvest:', 'अनुमानित कटाई:')}</strong> {harvestDate ? date(harvestDate) : t('Unknown', 'पता नहीं')}</li>
              <li><strong>{t('Area:', 'क्षेत्रफल:')}</strong> {area(areaHectares)}</li>
            </ul>
            <div className="actions">
              <button type="button" onClick={() => setStep('boundary')} disabled={saving || Boolean(savedFieldId)}>{t('Back', 'पीछे')}</button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? t('Saving field…', 'खेत सेव कर रहे हैं…') : savedFieldId ? t('Retry image check', 'तस्वीर की जाँच फिर करें') : t('Save & check images', 'सेव करके तस्वीरें जाँचें')}
              </button>
            </div>
            {status && <p className="wizard-status" role="status">{status}</p>}
            {savedFieldId && !saving && <button type="button" onClick={() => onComplete(savedFieldId)}>{t('Open saved field', 'सेव किया खेत खोलें')}</button>}
          </div>
        )}
        {error && <div className="wizard-error" role="alert"><p>{t('Please check your entries and connection, then retry. Your saved field will not be added twice.', 'जानकारी और कनेक्शन देखकर फिर कोशिश करें। सेव किया खेत दोबारा नहीं जुड़ेगा।')}</p><details><summary>{t('Technical details', 'तकनीकी जानकारी')}</summary>{error}</details></div>}
      </div>
    </div>
  );
}
