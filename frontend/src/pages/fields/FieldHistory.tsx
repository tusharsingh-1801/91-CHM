import { useOutletContext } from 'react-router-dom';

export function FieldHistory() {
  const { field } = useOutletContext<{ field: any }>();
  return (
    <div style={{ padding: '2rem' }}>
      <h2>Events & History for {field.name}</h2>
      <p>This section will contain the log of events (planting, irrigation, harvest) and alerts.</p>
    </div>
  );
}
