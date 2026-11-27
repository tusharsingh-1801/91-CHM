import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import {
  AlertTriangle, ArrowRight, Calendar, CheckCircle2, CloudSun, Compass, FileText, Info, Layers, MapPin, Plus, RefreshCw, Search, Send, Sprout, Zap,
} from 'lucide-react';
import { importLibrary } from '@googlemaps/js-api-loader';
import { configureMaps, googleFailed, markGoogleFailed } from '../../lib/maps';
import { searchPlaces } from '../../lib/placeSearch';
import { askFieldAssistant, loadFieldTasks, loadForecast, type DatabaseField, type FieldForecast } from '../../lib/api';
import { cropPhoto } from '../../lib/cropPhotos';
import { fieldActionHref, fieldAssessment, fieldCopy } from '../../lib/fieldCopy';
import { usePreferences } from '../../lib/preferencesContext';
import { useFarmerAccount } from '../auth/FarmerAccountContext';
import { NdviZones } from '../fields/NdviZones';
import './farm-home.css';

type Message = { role: 'user' | 'assistant'; text: string };
const deg = (value: number | null | undefined) => value == null ? '–' : Math.round(value);
const num = (value: unknown): number | null => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const tone = (state: string) => state === 'needs_inspection' ? 'visit' : state === 'no_unusual_change' ? 'routine' : 'imagery';
const toneColor = { visit: '#ef6b5b', routine: '#22b35e', imagery: '#e5a93d' } as const;

type Target = { n: number; lat: number; lng: number; box?: { south: number; west: number; north: number; east: number } };
type MapProps = { fields: DatabaseField[]; selectedId: string; onSelect: (id: string) => void; target: Target | null };
const fitOptions = { padding: 40 };

function LeafletFieldsMap({ fields, selectedId, onSelect, target }: MapProps) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shapes = useRef(new globalThis.Map<string, L.GeoJSON>());
  const selected = useRef(selectedId);
  useEffect(() => { selected.current = selectedId; }, [selectedId]);
  const style = (field: DatabaseField, on: boolean): L.PathOptions => { const color = toneColor[tone(fieldAssessment(field).state)]; return on ? { color: '#fff', weight: 4, dashArray: undefined, fillColor: color, fillOpacity: .55 } : { color, weight: 3, dashArray: '6 3', fillColor: color, fillOpacity: .3 }; };
  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, { scrollWheelZoom: false, zoomControl: false }).setView([28.6, 77.4], 11);
    mapRef.current = map;
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© OpenStreetMap contributors · Esri' }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, pane: 'overlayPane' }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, pane: 'overlayPane' }).addTo(map);
    const all: L.LatLngBounds[] = [];
    const registry = shapes.current;
    registry.clear();
    fields.forEach(field => {
      if (!field.boundary_geojson) return;
      try {
        const shape = L.geoJSON(field.boundary_geojson as unknown as GeoJsonObject, { style: () => style(field, field.id === selected.current) }).addTo(map);
        if (!shape.getBounds().isValid()) return;
        all.push(shape.getBounds());
        shape.on('click', () => onSelect(field.id));
        registry.set(field.id, shape);
      } catch { /* invalid polygon: skipped */ }
    });
    const focus = registry.get(selected.current)?.getBounds();
    if (focus) map.fitBounds(focus, { padding: [40, 40], maxZoom: 17 });
    else if (all.length) map.fitBounds(all.reduce((acc, item) => acc.extend(item), L.latLngBounds(all[0].getSouthWest(), all[0].getNorthEast())), { padding: [30, 30], maxZoom: 17 });
    return () => { map.remove(); mapRef.current = null; };
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    fields.forEach(field => shapes.current.get(field.id)?.setStyle(style(field, field.id === selectedId)));
    const bounds = shapes.current.get(selectedId)?.getBounds();
    if (bounds) { shapes.current.get(selectedId)?.bringToFront(); map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 17, duration: .6 }); }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) return;
    if (target.box) map.flyToBounds([[target.box.south, target.box.west], [target.box.north, target.box.east]], { maxZoom: 16, duration: .6 });
    else map.flyTo([target.lat, target.lng], 14, { duration: .6 });
  }, [target]);
  return <><div ref={element} className="fh-map" /><div className="fh-zoom"><button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>+</button><button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>−</button></div></>;
}

const mapsKey = (() => { const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined; return key && !key.startsWith('your-') ? key : ''; })();

/** Google hybrid map (satellite + place names) with every field boundary. Reports failure so the caller can fall back to Leaflet. */
function GoogleFieldsMap({ fields, selectedId, onSelect, target, onFail }: MapProps & { onFail: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const boundsById = useRef(new globalThis.Map<string, google.maps.LatLngBounds>());
  const selected = useRef(selectedId);
  useEffect(() => { selected.current = selectedId; }, [selectedId]);
  useEffect(() => {
    if (!element.current) return;
    let cancelled = false;
    let ready = false;
    configureMaps(mapsKey);
    // Key/referrer/billing rejections are reported through this global, and a stuck script load gets a time limit.
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => { if (!cancelled) onFail(); };
    const timer = window.setTimeout(() => { if (!cancelled && !ready) onFail(); }, 12000);
    importLibrary('maps').then(({ Map }) => {
      if (cancelled || !element.current) return;
      const map = new Map(element.current, { center: { lat: 28.6, lng: 77.4 }, zoom: 11, mapTypeId: 'hybrid', disableDefaultUI: true, gestureHandling: 'cooperative', clickableIcons: false });
      mapRef.current = map;
      google.maps.event.addListenerOnce(map, 'tilesloaded', () => { ready = true; window.clearTimeout(timer); });
      const all = new google.maps.LatLngBounds();
      boundsById.current.clear();
      fields.forEach(field => {
        const color = toneColor[tone(fieldAssessment(field).state)];
        if (!field.boundary_geojson) return;
        const added = map.data.addGeoJson({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: field.boundary_geojson as never, properties: { id: field.id, color } }] });
        const own = new google.maps.LatLngBounds();
        added.forEach(feature => feature.getGeometry()?.forEachLatLng(point => { own.extend(point); all.extend(point); }));
        if (!own.isEmpty()) boundsById.current.set(field.id, own);
      });
      map.data.setStyle(feature => { const on = feature.getProperty('id') === selected.current; const color = String(feature.getProperty('color')); return { fillColor: color, fillOpacity: on ? .55 : .3, strokeColor: on ? '#ffffff' : color, strokeWeight: on ? 4 : 3, zIndex: on ? 2 : 1 }; });
      map.data.addListener('click', (event: google.maps.Data.MouseEvent) => onSelect(String(event.feature.getProperty('id'))));
      const focus = boundsById.current.get(selected.current) ?? (all.isEmpty() ? null : all);
      if (focus) { map.fitBounds(focus, fitOptions.padding); google.maps.event.addListenerOnce(map, 'idle', () => { if ((map.getZoom() ?? 0) > 17) map.setZoom(17); }); }
    }).catch(() => { if (!cancelled) onFail(); });
    return () => { cancelled = true; window.clearTimeout(timer); mapRef.current = null; };
  }, [fields, onFail]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.data.setStyle(map.data.getStyle());
    const bounds = boundsById.current.get(selectedId);
    if (bounds) { map.fitBounds(bounds, fitOptions.padding); google.maps.event.addListenerOnce(map, 'idle', () => { if ((map.getZoom() ?? 0) > 17) map.setZoom(17); }); }
  }, [selectedId]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) return;
    if (target.box) map.fitBounds(target.box, 20);
    else { map.setCenter({ lat: target.lat, lng: target.lng }); map.setZoom(14); }
  }, [target]);
  return <><div ref={element} className="fh-map" /><div className="fh-zoom"><button aria-label="Zoom in" onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 11) + 1)}>+</button><button aria-label="Zoom out" onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 11) - 1)}>−</button></div></>;
}

/** Finds a village/place by name: Google Geocoding (through our server) first, then OpenStreetMap matches. */
async function findPlace(query: string): Promise<Omit<Target, 'n'> | null> {
  const [hit] = await searchPlaces(query);
  return hit ? { lat: hit.latitude, lng: hit.longitude, box: hit.box } : null;
}

function FieldsMap(props: MapProps) {
  const [mapFailed, setMapFailed] = useState(() => googleFailed('map'));
  const fail = useCallback(() => { markGoogleFailed('map'); setMapFailed(true); }, []);
  return mapsKey && !mapFailed ? <GoogleFieldsMap {...props} onFail={fail} /> : <LeafletFieldsMap {...props} />;
}

export function FarmHome({ fields, onAddField }: { fields: DatabaseField[]; onAddField: () => void }) {
  const { t, language, area, date } = usePreferences();
  const account = useFarmerAccount();
  const fullName = (account?.displayName || t('Farmer', 'किसान')).trim();
  const first = fullName.split(/\s+/)[0];
  const located = useMemo(() => fields.filter(field => field.latitude != null && field.longitude != null), [fields]);
  const [pickedId, setPickedId] = useState('');
  const mapField = fields.find(field => field.id === pickedId);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeBusy, setPlaceBusy] = useState(false);
  const [placeNote, setPlaceNote] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const searchPlace = async (event: FormEvent) => {
    event.preventDefault();
    const query = placeQuery.trim();
    if (query.length < 2 || placeBusy) return;
    setPlaceBusy(true); setPlaceNote('');
    try {
      const hit = await findPlace(query);
      if (hit) setTarget({ ...hit, n: Date.now() });
      else setPlaceNote(t('No place found. Try the village name with district or state.', 'जगह नहीं मिली। गाँव के साथ ज़िला या राज्य लिखकर देखें।'));
    } catch { setPlaceNote(t('Search is unavailable right now.', 'अभी खोज उपलब्ध नहीं।')); }
    finally { setPlaceBusy(false); }
  };
  const searchWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    const query = globalSearch.trim();
    if (!query) return;
    const field = fields.find(item => `${item.name} ${item.crop ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    if (field) { setPickedId(field.id); setGlobalSearch(''); document.getElementById('field-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    setPlaceQuery(query);
    try {
      const hit = await findPlace(query);
      if (hit) { setTarget({ ...hit, n: Date.now() }); setPlaceNote(''); }
      else setPlaceNote(t('No field or place found. Try a village with its district.', 'खेत या जगह नहीं मिली। गाँव के साथ ज़िला भी खोजें।'));
    } catch { setPlaceNote(t('Search is unavailable right now.', 'अभी खोज उपलब्ध नहीं है।')); }
    document.getElementById('field-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const [forecastId, setForecastId] = useState('');
  const forecastField = located.find(field => field.id === forecastId) ?? located[0];
  const [forecast, setForecast] = useState<FieldForecast | null>(null);
  const [forecastError, setForecastError] = useState(false);
  const [dueTasks, setDueTasks] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const fieldKey = fields.map(field => field.id).join(',');

  useEffect(() => {
    if (!forecastField) return;
    const controller = new AbortController();
    loadForecast(forecastField.id, { signal: controller.signal }).then(value => { setForecast(value); setForecastError(false); }).catch(() => { if (!controller.signal.aborted) { setForecast(null); setForecastError(true); } });
    return () => controller.abort();
  }, [forecastField?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    void Promise.all(fields.map(field => loadFieldTasks(field.id).catch(() => []))).then(rows => { if (active) setDueTasks(rows.flat().filter(task => task.status !== 'resolved').length); });
    return () => { active = false; };
  }, [fieldKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages, busy]);

  const totalArea = fields.reduce((sum, field) => sum + (num(field.area_hectares) ?? 0), 0);
  // Same priority as before the redesign: inspection signals, then due visits, then fields waiting for a clear picture.
  const urgency = (field: DatabaseField) => {
    const state = fieldAssessment(field).state;
    if (state === 'needs_inspection') return 0;
    if (Number(field.dueTasks) > 0) return 1;
    if (['image_too_old', 'not_enough_data', 'awaiting_analysis'].includes(state)) return 2;
    return 3;
  };
  const attention = fields.filter(field => urgency(field) < 3).sort((a, b) => urgency(a) - urgency(b));
  const signals = fields.filter(field => fieldAssessment(field).state === 'needs_inspection').length;
  const focus = attention[0];
  const focusCopy = focus ? fieldCopy(focus, language) : null;
  const askField = focus ?? fields[0];
  const days = forecast?.days ?? [];
  const wet = days.find(day => (day.precipitation_mm ?? 0) >= 5);
  const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric' });
  const icon = (rain: number | null, mm: number | null) => (mm ?? 0) >= 1 || (rain ?? 0) >= 50 ? '🌧️' : (rain ?? 0) >= 20 ? '⛅' : '☀️';
  const prompts = [t('Why is greenness changing?', 'हरियाली क्यों बदल रही है?'), t('Explain NDVI in simple terms', 'NDVI को आसान भाषा में समझाएँ'), t('What should I inspect today?', 'आज क्या जाँचना चाहिए?')];

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setMessages(current => [...current, { role: 'user', text: message }]);
    setQuestion(''); setBusy(true); setChatError('');
    try {
      const reply = await askFieldAssistant(message, askField?.id, language === 'hi' ? 'hi-IN' : 'en-IN');
      setMessages(current => [...current, { role: 'assistant', text: reply.answer }]);
    } catch (reason) { setChatError(reason instanceof Error ? reason.message : t('Assistant unavailable', 'सहायक उपलब्ध नहीं')); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(question); };
  const firstWith = fields[0];

  return <div className="farm-home">
    <header className="fh-topbar">
      <div className="fh-topbar-title"><Sprout size={18} aria-hidden="true"/><strong>{t('Dashboard', 'डैशबोर्ड')}</strong><small>{t('Grow Smarter', 'बेहतर खेती')}</small></div>
      <Link className="fh-toolbar-profile" to="/profile" aria-label={t('Open account settings', 'खाता सेटिंग खोलें')}><span>{first.slice(0,1).toUpperCase()}</span><div><strong>{fullName}</strong><small>{t('Farm workspace', 'खेत का कार्यक्षेत्र')}</small></div><ArrowRight size={15}/></Link>
    </header>
    <form className="fh-global-search" onSubmit={searchWorkspace} role="search">
      <Search size={17} aria-hidden="true"/><input value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} placeholder={t('Search village, place or field…', 'गाँव, जगह या खेत खोजें…')} aria-label={t('Search village, place or field', 'गाँव, जगह या खेत खोजें')}/><kbd>/</kbd>
    </form>
    {/* Hero + KPIs */}
    <section className="fh-top">
      <div className="fh-hero">
        <Sprout className="fh-hero-leaf" aria-hidden="true" />
        <div>
          <span className="fh-chip">{t('Your Farm Home', 'आपका फ़ार्म होम')}</span>
          <h1>{t('Hello,', 'नमस्ते,')} <span>{fullName}!</span></h1>
          <p>{t('See your fields, decide what to check, and record ground inspection data.', 'अपने खेत देखें, तय करें क्या जाँचना है और खेत की जानकारी सेव करें।')}</p>
        </div>
        <button className="fh-add" onClick={onAddField}><Plus size={16} strokeWidth={3} />{t('Add New Field', 'नया खेत जोड़ें')}<ArrowRight size={15}/></button>
      </div>
      <div className="fh-kpis" role="region" aria-label={t('Farm summary', 'खेतों का सारांश')}>
        <article><header><span>{t('Saved Fields', 'सेव किए खेत')}</span><i><Sprout size={16} /></i></header><strong>{fields.length}</strong><small>{t('Active fields', 'सक्रिय खेत')}</small></article>
        <article><header><span>{t('Recorded Area', 'दर्ज क्षेत्रफल')}</span><i><Compass size={16} /></i></header><strong className="fh-area">{area(totalArea)}</strong><small>{t('registered', 'पंजीकृत')}</small></article>
        <article><header><span>{t('Signals', 'संकेत')}</span><i className="warn"><Zap size={16} /></i></header><strong>{signals}</strong><small>{t('Inspection signals', 'जाँच के संकेत')}</small></article>
        <article><header><span>{t('Tasks Due', 'बाकी काम')}</span><i><Calendar size={16} /></i></header><strong>{dueTasks}</strong><small>{t('Open inspections', 'खुली जाँच')}</small></article>
      </div>
    </section>

    <div className="fh-grid">
      <div className="fh-main">
        {/* Attention */}
        <section className="fh-card fh-attention">
          <i className="fh-attn-icon">{focus ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</i>
          <div>
            <header><h3>{t('What needs attention?', 'किस पर ध्यान दें?')}</h3>{focus && <span className="fh-tag">{t('Action Required', 'कार्रवाई ज़रूरी')}</span>}</header>
            {focus && focusCopy ? <div className="fh-attn-row">
              <div><h4>{focus.name}</h4><p>{focusCopy.action === 'tasks' ? focusCopy.actionHint : focusCopy.explanation}</p></div>
              <Link className="fh-btn" to={fieldActionHref(focus)}>{focusCopy.actionLabel}<ArrowRight size={14} /></Link>
            </div> : <p className="fh-muted">{fields.length ? t('Nothing urgent right now. Keep visiting your fields regularly.', 'अभी कुछ ज़रूरी नहीं। खेतों की नियमित जाँच करते रहें।') : t('Add your first field to start monitoring.', 'निगरानी शुरू करने के लिए पहला खेत जोड़ें।')}</p>}
          </div>
        </section>

        {/* Map */}
        <section id="field-map" className="fh-card">
          <header className="fh-head"><div><h3><MapPin size={16} />{t('All Fields on One Map', 'सभी खेत एक नक्शे पर')}</h3><p>{t('Tap a field boundary to open detailed satellite metrics.', 'खेत की सीमा दबाकर उसकी जानकारी खोलें।')}</p></div><span className="fh-pill">{t(`${fields.length} Field${fields.length === 1 ? '' : 's'} Active`, `${fields.length} खेत सक्रिय`)}</span></header>
          <form className="fh-search" onSubmit={event => void searchPlace(event)} role="search"><Search size={16} aria-hidden="true" /><input value={placeQuery} onChange={event => setPlaceQuery(event.target.value)} placeholder={t('Search village or place…', 'गाँव या जगह खोजें…')} aria-label={t('Search village or place', 'गाँव या जगह खोजें')} /><button disabled={placeBusy || placeQuery.trim().length < 2}>{placeBusy ? '…' : t('Search', 'खोजें')}</button></form>
          {placeNote && <p className="fh-muted" role="status">{placeNote}</p>}
          <div className="fh-map-wrap">
            <FieldsMap fields={fields} selectedId={mapField?.id ?? ''} onSelect={setPickedId} target={target} />
          </div>
          {mapField && <div className="fh-pick"><div><strong>{mapField.name}</strong><small>{mapField.crop && mapField.crop !== 'Unknown' ? mapField.crop : t('Crop not added', 'फ़सल नहीं जोड़ी')} • {area(mapField.area_hectares)} • {fieldCopy(mapField, language).title}{mapField.latestObservation ? ` • NDVI ${Number(mapField.latestObservation.ndvi_value).toFixed(2)} (${date(mapField.latestObservation.observed_on)})` : ''}</small></div><Link className="fh-btn" to={`/fields/${mapField.id}/overview`}>{t('Open field', 'खेत खोलें')}<ArrowRight size={14} /></Link>
            {mapField.latestObservation?.ndvi_classes && <div className="fh-pick-zones"><NdviZones compact classes={mapField.latestObservation.ndvi_classes} /></div>}</div>}
        </section>

        {/* Weather */}
        <section className="fh-card">
          <header className="fh-head"><div><h3><CloudSun size={16} />{t('Next 7 Days Weather Forecast', 'अगले 7 दिन का मौसम')}</h3><p>{t('Forecast for your fields', 'आपके खेतों का पूर्वानुमान')}</p></div>
            {located.length > 0 && <label className="fh-select">{t('Field', 'खेत')}: <select value={forecastField?.id ?? ''} onChange={event => setForecastId(event.target.value)}>{located.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>}</header>
          {!located.length && <p className="fh-muted">{t('Add a field with map coordinates to see its forecast.', 'मौसम देखने के लिए नक्शे के साथ खेत जोड़ें।')}</p>}
          {located.length > 0 && !forecast && !forecastError && <p className="fh-muted" role="status">{t('Checking upcoming weather…', 'आने वाला मौसम देख रहे हैं…')}</p>}
          {forecastError && <p className="fh-muted" role="alert">{t('Forecast unavailable right now.', 'अभी पूर्वानुमान उपलब्ध नहीं।')}</p>}
          {forecast && <>
            <div className="fh-days">{days.slice(0, 7).map((day, index) => <div key={day.date} className={index === 0 ? 'today' : ''}>
              <b>{dayLabel(day.date)}</b><span className="emoji">{icon(day.rain_probability_percent, day.precipitation_mm)}</span>
              <strong>{deg(day.max_c)}° / {deg(day.min_c)}°</strong>
              <small>{t('Rain', 'बारिश')}: {day.precipitation_mm ?? 0} mm</small><small>{t('Hum', 'नमी')}: {day.humidity_percent ?? '–'}%</small>
            </div>)}</div>
            <p className="fh-insight"><Info size={16} />{wet ? t(`Heavy rain (${wet.precipitation_mm} mm) is forecast on ${dayLabel(wet.date)}. Plan irrigation and inspections around it.`, `${dayLabel(wet.date)} को ${wet.precipitation_mm} mm बारिश का अनुमान है। सिंचाई और जाँच उसी हिसाब से करें।`) : t('No day with 5mm or more rainfall forecast. Ideal window for scheduled field inspection and soil moisture checks.', '5 mm या ज़्यादा बारिश का अनुमान नहीं है। खेत की जाँच और नमी देखने का अच्छा समय।')}</p>
          </>}
        </section>

        {/* Quick links */}
        <section className="fh-card">
          <h3 className="fh-h">{t('What would you like to see?', 'आप क्या देखना चाहेंगे?')}</h3>
          <div className="fh-quick">
            {([
              [Sprout, t('My fields', 'मेरे खेत'), t(`${fields.length} Active`, `${fields.length} सक्रिय`), '#fh-fields'],
              [Layers, t('Satellite images', 'सैटेलाइट तस्वीरें'), t('Crop & satellite photos', 'फ़सल और सैटेलाइट'), '/gallery'],
              [CloudSun, t('Weather history', 'मौसम इतिहास'), t('Weather archive', 'मौसम अभिलेख'), firstWith ? `/fields/${firstWith.id}/analysis` : '/'],
              [RefreshCw, t('Crop changes', 'फ़सल में बदलाव'), t('NDVI analytics', 'NDVI विश्लेषण'), firstWith ? `/fields/${firstWith.id}/analysis` : '/'],
              [Calendar, t('Visits & tasks', 'जाँच और काम'), t(`${dueTasks} open`, `${dueTasks} खुले`), firstWith ? `/fields/${firstWith.id}/overview#planned-tasks` : '/'],
              [FileText, t('Reports', 'रिपोर्ट'), t('Export PDF/CSV', 'PDF/CSV'), '/reports'],
            ] as const).map(([Icon, label, desc, href]) => href.startsWith('#')
              ? <a key={label} href={href}><i><Icon size={16} /></i><strong>{label}</strong><small>{desc}</small></a>
              : <Link key={label} to={href}><i><Icon size={16} /></i><strong>{label}</strong><small>{desc}</small></Link>)}
          </div>
        </section>
      </div>

      <aside className="fh-side">
        {/* Gemini */}
        <section className="fh-card fh-gemini">
          <header className="fh-head"><div className="fh-title-row"><i className="fh-spark">✨</i><h3>{t('Ask Gemini AI', 'Gemini AI से पूछें')}</h3></div></header>
          <p className="fh-muted">{t('Get direct explanations of crop greenness, satellite index changes, or weather impacts.', 'फ़सल की हरियाली, सैटेलाइट बदलाव या मौसम का असर समझें।')}</p>
          <div className="fh-prompts">{prompts.map(prompt => <button key={prompt} disabled={busy} onClick={() => void send(prompt)}><span>{prompt}</span><ArrowRight size={12} /></button>)}</div>
          <div className={`fh-chat${messages.length || busy || chatError ? ' has-msgs' : ''}`} ref={log} aria-live="polite">
            {!messages.length && <div className="bot"><p>{t(`Hello ${first}! I am Gemini AI. How can I help with ${askField?.name ?? 'your fields'} today?`, `नमस्ते ${first}! मैं Gemini AI हूँ। ${askField?.name ?? 'आपके खेतों'} में आज कैसे मदद करूँ?`)}</p></div>}
            {messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'me' : 'bot'}><p>{message.text}</p></div>)}
            {busy && <div className="bot"><p>…</p></div>}
            {chatError && <div className="bot err" role="alert"><p>{chatError}</p></div>}
          </div>
          <form onSubmit={submit}><input id="fh-gemini-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder={t('Ask Gemini AI a question...', 'Gemini AI से सवाल पूछें...')} aria-label={t('Ask Gemini AI', 'Gemini AI से पूछें')} /><button aria-label={t('Send', 'भेजें')} disabled={busy || !question.trim()}><Send size={14} /></button></form>
        </section>

        {/* My fields */}
        <section id="fh-fields" className="fh-card">
          <header className="fh-head"><h3>{t(`My Fields (${fields.length})`, `मेरे खेत (${fields.length})`)}</h3><button className="fh-link" onClick={onAddField}><Plus size={14} />{t('Add Field', 'खेत जोड़ें')}</button></header>
          <div className="fh-fields">
            {[...fields].sort((a, b) => urgency(a) - urgency(b)).map(field => { const copy = fieldCopy(field, language); const photo = cropPhoto(field.crop);
              return <Link key={field.id} to={`/fields/${field.id}/overview`} className="fh-field">
                <img src={photo.src} alt={photo.alt} loading="lazy" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />
                <div><header><h4>{field.name}</h4><span className={`fh-status ${tone(copy.assessment.state)}`}>{copy.title}</span></header>
                  <p>{field.crop && field.crop !== 'Unknown' ? field.crop : t('Crop not added', 'फ़सल नहीं जोड़ी')} • {area(field.area_hectares)}</p>
                  <small>NDVI: {num(field.ndvi_average)?.toFixed(2) ?? '--'} • {t('Last', 'पिछली')}: {field.latestObservation ? date(field.latestObservation.observed_on) : t('Not available', 'उपलब्ध नहीं')}</small></div>
              </Link>; })}
            {!fields.length && <p className="fh-muted">{t('No fields yet. Add your first field.', 'अभी कोई खेत नहीं। पहला खेत जोड़ें।')}</p>}
          </div>
        </section>

        {/* Compare */}
        <section className="fh-card">
          <h3 className="fh-h">{t('Compare Satellite Dates', 'सैटेलाइट तारीखों की तुलना')}</h3>
          <p className="fh-muted">{t('Pick two clear satellite dates to see how your crop changed.', 'बदलाव देखने के लिए दो साफ़ तस्वीरों की तारीख़ें चुनें।')}</p>
          <div className="fh-dates"><span>{t('Date 1', 'तारीख़ 1')}: {t('Not set', 'चुनी नहीं')}</span><span>{t('Date 2', 'तारीख़ 2')}: {t('Not set', 'चुनी नहीं')}</span></div>
          <Link className="fh-wide" to={firstWith ? `/fields/${firstWith.id}/history` : '/'}>{t('Select Dates for Comparison', 'तुलना के लिए तारीख़ें चुनें')}</Link>
        </section>
      </aside>
    </div>
  </div>;
}
