import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { loadNdviAnalysis, loadNdvi, askFieldAssistant } from '../../lib/api';

export function FieldAnalysis() {
  const { field } = useOutletContext<{ field: any }>();
  const [analysis, setAnalysis] = useState<any>(null);
  const [observations, setObservations] = useState<any[]>([]);
  const [language, setLanguage] = useState('en-IN');
  const [loading, setLoading] = useState(true);
  
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!field?.id) return;
    setLoading(true);
    Promise.all([
      loadNdviAnalysis(field.id, language).catch(() => null),
      loadNdvi(field.id).catch(() => [])
    ]).then(([analysisData, ndviData]) => {
      setAnalysis(analysisData);
      setObservations(ndviData);
      setLoading(false);
    });
  }, [field?.id, language]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    try {
      const res = await askFieldAssistant(question, field.id, language);
      setAnswer(res.answer);
    } catch (err) {
      setAnswer("Sorry, I could not generate an answer right now.");
    } finally {
      setAsking(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading analysis...</div>;

  return (
    <div style={{ padding: '2rem', display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Health Analysis</h2>
          <select value={language} onChange={e => setLanguage(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px' }}>
            <option value="en-IN">English</option>
            <option value="hi-IN">Hindi (हिंदी)</option>
            <option value="bn-IN">Bengali (বাংলা)</option>
            <option value="te-IN">Telugu (తెలుగు)</option>
          </select>
        </div>

        {analysis ? (
          <div style={{ background: '#f0fdf4', padding: '1.5rem', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '2rem' }}>
            <h3 style={{ marginTop: 0, color: '#166534' }}>{analysis.statusLabel} (Trend: {analysis.trend})</h3>
            <p style={{ color: '#15803d', fontSize: '1.1rem', lineHeight: '1.5' }}>{analysis.summary}</p>
            {analysis.recommendation && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff', borderRadius: '4px', borderLeft: '4px solid #166534' }}>
                <strong>Recommendation:</strong> {analysis.recommendation}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '8px', marginBottom: '2rem' }}>No automated analysis available for this field.</div>
        )}

        <h3>Vegetation Indices (NDVI)</h3>
        {observations.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem 0' }}>Date</th>
                <th>Cloud Cover</th>
                <th>NDVI</th>
                <th>NDRE</th>
                <th>NDMI</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((obs, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem 0' }}>{new Date(obs.observed_on).toLocaleDateString()}</td>
                  <td>{obs.cloud_cover}%</td>
                  <td style={{ fontWeight: 'bold' }}>{typeof obs.ndvi_value === 'number' ? obs.ndvi_value.toFixed(3) : obs.ndvi_value}</td>
                  <td>{obs.ndre_value ? Number(obs.ndre_value).toFixed(3) : '-'}</td>
                  <td>{obs.ndmi_value ? Number(obs.ndmi_value).toFixed(3) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No observations recorded yet.</p>
        )}
      </div>

      <div style={{ background: '#f9fafb', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e5e7eb', height: 'fit-content' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Ask Assistant</h3>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>Ask AI about your field's health or crop management in your preferred language.</p>
        
        <form onSubmit={handleAsk} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <textarea 
            value={question} 
            onChange={e => setQuestion(e.target.value)} 
            placeholder="e.g. When should I irrigate next?" 
            rows={4}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', resize: 'vertical' }}
            required
          />
          <button 
            type="submit" 
            disabled={asking}
            style={{ background: '#4d7c0f', color: 'white', padding: '0.75rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {asking ? 'Thinking...' : 'Ask AI'}
          </button>
        </form>

        {answer && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'white', borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '0.9rem', lineHeight: '1.5' }}>
            <strong>Answer:</strong>
            <p style={{ margin: '0.5rem 0 0 0' }}>{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
