import {useState} from 'react';
import {OpenFieldMap} from '../../lib/OpenFieldMap';
import {qualityReason} from '../../../../shared/evidence';
import type {DatabaseField,Observation,SatelliteScene} from '../../lib/api';
import {usePreferences} from '../../lib/preferencesContext';
export function SatelliteDateComparison({field,scenes,observations}:{field:DatabaseField;scenes:SatelliteScene[];observations:Observation[]}){
 const {t,date}=usePreferences();
 const [before,setBefore]=useState('');
 const [after,setAfter]=useState('');
 const available=observations.filter(o=>o.accepted&&o.provenance==='measured_imagery'&&o.boundary_version===field.boundary_version&&!qualityReason(o,field.policy)&&scenes.some(scene=>scene.scene_id===o.scene_id)).sort((a,b)=>a.observed_on.localeCompare(b.observed_on));
 const earlier=available.find(o=>o.scene_id===before)||available[0];
 const later=available.find(o=>o.scene_id===after)||available.at(-1);
 const hasPosition=field.latitude!=null&&field.longitude!=null&&Number.isFinite(Number(field.latitude))&&Number.isFinite(Number(field.longitude));
 const valid=available.length>=2&&earlier&&later&&earlier.scene_id!==later.scene_id&&hasPosition&&field.boundary_geojson;
 const tile=(id:string)=>`/api/fields/${field.id}/tiles/${encodeURIComponent(id)}/{z}/{x}/{y}.png`;
 return <section className="advanced-comparison" aria-label={t('Real two-date vegetation comparison','दो तारीख़ों की वनस्पति तुलना')}>
  <h2>{t('Before and after: actual NDVI map layers','पहले और बाद में: NDVI मैप की दो परतें')}</h2>
  <p>{t('Choose two processed, quality-accepted Sentinel scenes. Each map loads that scene’s own NDVI tiles using the saved field boundary.','दो गुणवत्ता-जाँची गई Sentinel तस्वीरें चुनें। हर नक्शा उसी तारीख़ की NDVI टाइलें दिखाता है।')}</p>
  {!valid?<p>{t('Two accepted satellite images and a saved field boundary are required.','दो साफ़ सैटेलाइट तस्वीरें और खेत की सीमा चाहिए।')}</p>:
  <>
   <div className="advanced-compare-controls">
    <label>{t('Before','पहले')}<select value={earlier.scene_id??''} onChange={e=>setBefore(e.target.value)}>{available.filter(o=>o.scene_id!==later.scene_id).map(o=><option key={o.scene_id} value={o.scene_id??''}>{date(o.observed_on)}</option>)}</select></label>
    <label>{t('After','बाद में')}<select value={later.scene_id??''} onChange={e=>setAfter(e.target.value)}>{available.filter(o=>o.scene_id!==earlier.scene_id).map(o=><option key={o.scene_id} value={o.scene_id??''}>{date(o.observed_on)}</option>)}</select></label>
   </div>
   <div className="advanced-compare-maps">{[earlier,later].map((o,i)=><div key={o.scene_id}><h3>{i===0?t('Before','पहले'):t('After','बाद में')} · {date(o.observed_on)}</h3><OpenFieldMap latitude={Number(field.latitude)} longitude={Number(field.longitude)} fieldName={field.name} boundaryGeojson={field.boundary_geojson} tileUrl={tile(o.scene_id??'')} opacity={.82}/><p>NDVI {Number(o.ndvi_value).toFixed(3)} · {t('Usable pixels','साफ़ पिक्सल')}: {o.valid_pixel_count}</p></div>)}</div>
   <p><strong>{t('NDVI change','NDVI बदलाव')}: {(Number(later.ndvi_value)-Number(earlier.ndvi_value)).toFixed(3)}</strong> · {t('Differences do not establish the cause of stress or disease.','बदलाव से रोग या परेशानी का कारण निश्चित नहीं होता।')}</p>
  </>}
 </section>;
}
