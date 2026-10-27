import { Link } from 'react-router-dom';
import { Cloud, ShieldCheck, ArrowRight } from 'lucide-react';
import { qualityReason } from '../../../../shared/evidence';
import { fieldAssessment } from '../../lib/fieldCopy';
import { usePreferences } from '../../lib/preferencesContext';
import type { DatabaseField } from '../../lib/api';

export function ObservationQualityPanel({ fields }: { fields: DatabaseField[] }) {
  const { t, date } = usePreferences();
  const real = fields;
  if (!real.length) return null;
  const rows = real.map(field => {
    const reading = field.latestObservation;
    const accepted = reading?.accepted && reading.provenance === 'measured_imagery'
      && reading.boundary_version === (field.boundary_version ?? 1) && !qualityReason(reading, field.policy);
    const state = fieldAssessment(field);
    return { field, reading: accepted ? reading : null, state };
  });
  const usable = rows.filter(row => !!row.reading).length;
  const stale = rows.filter(row => row.state.state === 'image_too_old').length;
  return <section className="addon-card addon-quality" aria-label={t('Satellite observation quality', 'सैटेलाइट तस्वीर की गुणवत्ता')}>
    <h3><ShieldCheck size={19}/>{t('How reliable are the latest images?', 'पिछली तस्वीरों की गुणवत्ता कैसी है?')}</h3>
    <p>{t(`${usable} of ${real.length} fields have an accepted satellite measurement; ${stale} need newer imagery.`,
      `${real.length} में से ${usable} खेतों की मान्य सैटेलाइट रीडिंग है; ${stale} में नई तस्वीर चाहिए।`)}</p>
    <div className="addon-quality-grid">
      {rows.slice(0,5).map(({field,reading,state})=><Link key={field.id} to={`/fields/${field.id}/map`} className="addon-quality-row">
        <span><strong>{field.name}</strong><small>{reading ? `${date(reading.observed_on)} · ${reading.source}` : t('No accepted recent imagery', 'नई मान्य तस्वीर नहीं')}</small></span>
        <span>{reading ? <><ShieldCheck size={15} aria-hidden="true"/> {reading.valid_coverage_percent}%</> : <><Cloud size={15} aria-hidden="true"/> {state.state === 'image_too_old' ? t('Old image', 'पुरानी तस्वीर') : t('Unknown', 'अज्ञात')}</>}</span>
        <ArrowRight size={16} aria-hidden="true"/>
      </Link>)}
    </div>
    <p className="addon-quality-note">{t('Coverage means usable pixels, not crop health. Open a field to inspect source, date, and quality.', 'साफ़ हिस्सा फ़सल की सेहत का प्रतिशत नहीं है। स्रोत, तारीख़ और गुणवत्ता खेत खोलकर देखें।')}</p>
  </section>;
}
