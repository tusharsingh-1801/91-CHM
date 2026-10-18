import { useState, useEffect, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { qualityReason } from '../../../../shared/evidence';
import { OpenFieldMap } from '../../lib/OpenFieldMap';
import { loadFieldAlerts, loadScenes, loadNdvi, updateFieldAlert, type DatabaseField, type SatelliteScene, type Alert, type Observation } from '../../lib/api';
import { usePreferences } from '../../lib/preferencesContext';
import { ImageCheckPanel } from '../../features/fields/ImageCheckPanel';
import { MapInspectionGuide } from '../../features/fields/MapInspectionGuide';
import { SatelliteDateComparison } from '../../features/fields/SatelliteDateComparison';

export function FieldMap() {
  const { field, refreshField } = useOutletContext<{ field: DatabaseField; refreshField: () => Promise<void> }>();
  const { t, date } = usePreferences();
  const [scenes, setScenes] = useState<SatelliteScene[]>([]);
  const [selected, setSelected] = useState('');
  const [observations, setObservations] = useState<Observation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [opacity, setOpacity] = useState(.8);
  const [showLayer, setShowLayer] = useState(true);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState(false);
  const latestId = field.latestObservation?.accepted && field.latestObservation.provenance === 'measured_imagery' && field.latestObservation.boundary_version === field.boundary_version ? field.latestObservation.scene_id : field.latest_scene_id ?? null;
  const refresh = useCallback(async () => {
    const [nextScenes, nextObservations, nextAlerts] = await Promise.all([loadScenes(field.id), loadNdvi(field.id), loadFieldAlerts(field.id)]);
    return { nextScenes, nextObservations, nextAlerts };
  }, [field.id]);
  const apply = useCallback((result: Awaited<ReturnType<typeof refresh>>) => {
    setScenes(result.nextScenes); setObservations(result.nextObservations); setAlerts(result.nextAlerts);
    setSelected(current => current && result.nextScenes.some(scene => scene.scene_id === current) ? current : latestId && result.nextScenes.some(scene => scene.scene_id === latestId) ? latestId : result.nextScenes[0]?.scene_id ?? '');
    setError(false);
  }, [latestId]);
  useEffect(() => { let cancelled = false; void refresh().then(result => { if (!cancelled) apply(result); }).catch(() => { if (!cancelled) setError(true); }); return () => { cancelled = true; }; }, [refresh, apply]);
  const selectedObservation = observations.find(item => item.scene_id === selected && item.boundary_version === field.boundary_version);
  const scene = scenes.find(item => item.scene_id === selected);
  const accepted = selectedObservation?.accepted && selectedObservation.provenance === 'measured_imagery' && !qualityReason(selectedObservation, field.policy);
  const label = accepted ? selected === latestId ? t('Latest clear picture', 'पिछली साफ़ तस्वीर') : t('Older clear picture', 'पुरानी साफ़ तस्वीर') : selectedObservation ? t('Picture too unclear to use', 'तस्वीर में खेत साफ़ नहीं दिखा') : t('Picture not checked for this field outline', 'इस सीमा के लिए तस्वीर की जाँच नहीं हुई');
  const tileUrl = accepted && showLayer ? `/api/fields/${field.id}/tiles/${encodeURIComponent(selected)}/{z}/{x}/{y}.png` : null;
  const activeAlert = alerts.find(item => !['resolved','superseded'].includes(item.action_status) && !item.resolved && item.scene_id === selected);
  const hasLocation = field.latitude != null && field.longitude != null && Number.isFinite(Number(field.latitude)) && Number.isFinite(Number(field.longitude));
  return <div className="field-map-panel">
    <div className="field-map-toolbar"><label><strong>{t('Image date', 'तस्वीर की तारीख़')}</strong><select value={selected} disabled={!scenes.length} onChange={event => setSelected(event.target.value)}>{!scenes.length && <option value="">{t('No images available yet', 'अभी कोई तस्वीर उपलब्ध नहीं')}</option>}{scenes.map(item => <option key={item.scene_id} value={item.scene_id}>{date(item.observed_at)} · {t(`Picture ${scenes.filter(other => other.observed_at.slice(0,10) === item.observed_at.slice(0,10)).findIndex(other => other.scene_id === item.scene_id) + 1}`, `तस्वीर ${scenes.filter(other => other.observed_at.slice(0,10) === item.observed_at.slice(0,10)).findIndex(other => other.scene_id === item.scene_id) + 1}`)}{item.scene_id === latestId ? ` · ${t('Latest clear image', 'पिछली साफ़ तस्वीर')}` : ''}</option>)}</select></label><Link className="action-link" to={`/fields/${field.id}/overview?action=visit`}>{t('Plan a field visit', 'खेत की जाँच तय करें')} →</Link></div>
    {error && <p className="error-notice" role="alert">{t('Image information could not be loaded.', 'तस्वीर की जानकारी नहीं मिली।')} <button onClick={() => void refresh().then(apply).catch(() => setError(true))}>{t('Retry', 'फिर कोशिश करें')}</button></p>}
    <section className="selected-image-summary" aria-label={t('Selected image summary', 'चुनी तस्वीर का सारांश')}><strong>{scene ? date(scene.observed_at) : t('No image selected', 'तस्वीर नहीं चुनी')} · {label}</strong><p>{t('Field visible clearly', 'खेत का साफ़ दिखा हिस्सा')}: {selectedObservation?.valid_coverage_percent != null ? `${selectedObservation.valid_coverage_percent}%` : t('Not available', 'उपलब्ध नहीं')}{selected && selected !== latestId ? ` · ${t('This is not the current field summary.', 'यह खेत की अभी की स्थिति नहीं है।')}` : ''}</p></section>
    <div className="field-map-canvas">{hasLocation ? <OpenFieldMap latitude={Number(field.latitude)} longitude={Number(field.longitude)} fieldName={field.name} boundaryGeojson={field.boundary_geojson} stressGeojson={accepted ? selectedObservation?.inspection_geojson ?? null : null} tileUrl={tileUrl} opacity={opacity}/> : <div className="map-unavailable" role="status">{t('Save a field boundary to see its map.', 'नक्शा देखने के लिए खेत की सीमा सेव करें।')}</div>}
      {accepted && showLayer && <div className="ndvi-map-legend"><h4>{t('Vegetation in the image', 'तस्वीर में हरियाली')}</h4><div><span>{t('Less vegetation', 'कम हरियाली')}</span><div className="legend-gradient"/><span>{t('More vegetation', 'ज़्यादा हरियाली')}</span></div></div>}
    </div>
    <div className="map-layer-controls"><label><input type="checkbox" checked={showLayer} disabled={!accepted} onChange={event => setShowLayer(event.target.checked)}/>{t('Show vegetation colours', 'हरियाली के रंग दिखाएँ')}</label><label>{t('Colour strength', 'रंग की गहराई')}<input type="range" min="0" max="1" step="0.1" value={opacity} disabled={!accepted || !showLayer} onChange={event => setOpacity(Number(event.target.value))}/></label></div>
    <p className="map-explanation">{t('Marked areas are places to inspect, not a disease diagnosis. Blank areas have no usable readings. The street map is a background, not the satellite image being analysed.', 'चिह्नित जगहों की खेत में जाँच करें; ये बीमारी की पुष्टि नहीं हैं। खाली जगहों की जानकारी उपलब्ध नहीं है। सड़क वाला नक्शा केवल पृष्ठभूमि है, जाँची गई satellite तस्वीर नहीं।')}</p>
    {activeAlert && <div className="map-alert"><div><strong>{t('This image has an inspection notice.', 'इस तस्वीर के लिए जाँच का नोटिस है।')}</strong><p>{t('Record a visit or update what you have done.', 'खेत की जाँच तय करें या अपनी कार्रवाई दर्ज करें।')}</p></div><label>{t('Notice status', 'नोटिस की स्थिति')}<select value={activeAlert.action_status || 'open'} disabled={changing} onChange={async event => { const status = event.target.value as 'open'|'acknowledged'|'action_taken'|'resolved'; setChanging(true); try { await updateFieldAlert(field.id, activeAlert.id, status); setAlerts(current => current.map(item => item.id === activeAlert.id ? { ...item, action_status: status, resolved: status === 'resolved' } : item)); } catch { setError(true); } finally { setChanging(false); } }}><option value="open">{t('Open', 'खुला')}</option><option value="acknowledged">{t('Seen', 'देख लिया')}</option><option value="action_taken">{t('Action taken', 'कार्रवाई की')}</option><option value="resolved">{t('Close notice', 'नोटिस बंद करें')}</option></select></label><small>{t('Closing a notice does not confirm crop recovery.', 'नोटिस बंद करने से फ़सल के ठीक होने की पुष्टि नहीं होती।')}</small></div>}
    <SatelliteDateComparison field={field} scenes={scenes} observations={observations}/>
    <MapInspectionGuide field={field} imageDate={scene?.observed_at ?? null} accepted={Boolean(accepted)}/>
    <ImageCheckPanel field={field} onComplete={async () => { await refreshField(); apply(await refresh()); }}/>
    <details className="selected-image-evidence"><summary>{t('Technical image details', 'तस्वीर की तकनीकी जानकारी')}</summary><section aria-label={t('Selected image evidence', 'चुनी तस्वीर की जानकारी')}><strong>{label}</strong><p>{t('Acquired at', 'तस्वीर का पूरा समय')}: {scene?.observed_at || t('Unavailable', 'उपलब्ध नहीं')}</p><p>{t('Scene ID', 'Scene ID')}: {scene?.scene_id || t('Unavailable', 'उपलब्ध नहीं')} · {t('Scene processing', 'जाँच की स्थिति')}: {scene?.processing_status || t('Unavailable', 'उपलब्ध नहीं')}</p><p>{t('Selected evidence boundary version', 'चुनी तस्वीर की सीमा का संस्करण')}: {selectedObservation?.boundary_version ?? t('Unavailable', 'उपलब्ध नहीं')} · {t('Current field boundary version', 'अभी की सीमा का संस्करण')}: {field.boundary_version ?? t('Unavailable', 'उपलब्ध नहीं')}</p><p>{t('Usable field coverage', 'जाँचने लायक क्षेत्र')}: {selectedObservation?.valid_coverage_percent != null ? `${selectedObservation.valid_coverage_percent}%` : t('Unavailable', 'उपलब्ध नहीं')} · {t('Usable pixels', 'जाँचने लायक pixels')}: {selectedObservation?.valid_pixel_count ?? t('Unavailable', 'उपलब्ध नहीं')}</p><p>{t('Scene-wide cloud cover', 'पूरे satellite scene में बादल')}: {scene?.cloud_cover != null ? `${scene.cloud_cover}%` : t('Unavailable', 'उपलब्ध नहीं')}{t(' (not field coverage)', ' (यह खेत का साफ़ हिस्सा नहीं है)')}</p>{selectedObservation && !accepted && <p>{t('Not accepted', 'जाँच में उपयोग नहीं किया')}: {selectedObservation.quality_reason || qualityReason(selectedObservation, field.policy) || t('Unverified legacy evidence', 'पुरानी जानकारी सत्यापित नहीं')}</p>}<p>{selectedObservation?.source}</p></section></details>
  </div>;
}
