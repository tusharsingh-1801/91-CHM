import { usePreferences } from '../../lib/preferencesContext';

/** One short line crediting the open data behind the app, as the data licences ask. */
export function DataCredits({ className = '' }: { className?: string }) {
  const { t } = usePreferences();
  const link = (href: string, label: string) => <a href={href} target="_blank" rel="noreferrer">{label}</a>;
  return <p className={`data-credits ${className}`.trim()}>
    {t('Data credits: ', 'डेटा के स्रोत: ')}
    {t('contains modified ', 'इसमें बदली हुई ')}{link('https://www.copernicus.eu/', 'Copernicus Sentinel-2')}{t(' data; weather history from ', ' तस्वीरें; पिछला मौसम ')}{link('https://power.larc.nasa.gov/', 'NASA POWER')}{t('; forecasts by ', '; पूर्वानुमान ')}{link('https://open-meteo.com/', 'Open-Meteo.com')}{t(' (CC BY 4.0); maps © ', ' (CC BY 4.0); नक्शे © ')}{link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}{t(' contributors.', ' योगदानकर्ता।')}
  </p>;
}
