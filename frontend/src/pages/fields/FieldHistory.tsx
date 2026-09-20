import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { loadFieldEvents, createFieldEvent } from '../../lib/api';

export function FieldHistory() {
  const { field } = useOutletContext<{ field: any }>();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [type, setType] = useState('planting');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!field?.id) return;
    loadFieldEvents(field.id).then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, [field?.id]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !date) return;
    try {
      await createFieldEvent(field.id, type, date, notes);
      setType('planting');
      setDate('');
      setNotes('');
      const updatedEvents = await loadFieldEvents(field.id);
      setEvents(updatedEvents);
    } catch {
      alert("Failed to add event");
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading history...</div>;

  return (
    <div style={{ padding: '2rem', display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
      <div>
        <h2 style={{ marginTop: 0 }}>Events & History</h2>
        {events.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {events.map(ev => (
              <div key={ev.id} style={{ padding: '1rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.25rem 0', textTransform: 'capitalize' }}>{ev.event_type.replace('_', ' ')}</h4>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>{ev.notes || 'No notes provided'}</p>
                </div>
                <div style={{ color: '#4b5563', fontWeight: '500' }}>
                  {new Date(ev.event_date).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>No events recorded for this field.</p>
        )}
      </div>

      <div style={{ background: '#f9fafb', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e5e7eb', height: 'fit-content' }}>
        <h3 style={{ marginTop: 0 }}>Log New Event</h3>
        <form onSubmit={handleAddEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            Event Type
            <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}>
              <option value="planting">Planting</option>
              <option value="fertilizer">Fertilizer Application</option>
              <option value="irrigation">Irrigation</option>
              <option value="pesticide">Pesticide Application</option>
              <option value="harvest">Harvest</option>
              <option value="scouting">Field Scouting</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            Date
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            Notes (Optional)
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', resize: 'vertical' }} />
          </label>
          <button type="submit" style={{ background: '#4d7c0f', color: 'white', padding: '0.75rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
            Save Event
          </button>
        </form>
      </div>
    </div>
  );
}
