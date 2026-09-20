import { useOutletContext } from 'react-router-dom';

export function FieldAnalysis() {
  const { field } = useOutletContext<{ field: any }>();
  return (
    <div style={{ padding: '2rem' }}>
      <h2>Health Analysis for {field.name}</h2>
      <p>This section will contain the NDVI trend charts, metrics, and automated AI insights.</p>
    </div>
  );
}
