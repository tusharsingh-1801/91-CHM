type Translate = (english: string, hindi: string) => string;

/** Farmer-facing name for a diary event type stored by the API. */
export function eventLabel(t: Translate, value: string): string {
  const labels: Record<string, string> = {
    planting: t('Planting', 'बुवाई'),
    fertilizer: t('Fertilizer Application', 'खाद डालना'),
    irrigation: t('Irrigation', 'सिंचाई'),
    pesticide: t('Pesticide Application', 'कीटनाशक डालना'),
    scouting: t('Scouting / Observation', 'खेत की जाँच'),
    harvest: t('Harvest', 'कटाई'),
    other: t('Other', 'अन्य'),
    dataset_import: t('Public boundary imported', 'सार्वजनिक सीमा जोड़ी गई'),
  };
  return labels[value] || value;
}
