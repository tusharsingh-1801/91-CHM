import { useEffect, useState, type ChangeEvent } from 'react';
import {
  getPotatoLeafStatus,
  predictPotatoLeaf,
  type PotatoLeafPredictionResult,
} from '../../lib/api';

export function PotatoLeafAnalysis() {
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<PotatoLeafPredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void getPotatoLeafStatus(controller.signal).then(status => {
      if (!controller.signal.aborted) setModelAvailable(status.model_available);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setStatusError(cause instanceof Error ? cause.message : 'Potato model status is unavailable.');
      }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(null);
    setPreview('');
    setResult(null);
    setError('');
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG or WebP image under 5 MB.');
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function analyze() {
    if (!file || !modelAvailable || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Unable to read image.'));
        reader.onerror = () => reject(new Error('Unable to read image.'));
        reader.readAsDataURL(file);
      });
      setResult(await predictPotatoLeaf(image));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Potato leaf analysis failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="potato-research help-guide" aria-labelledby="potato-research-title">
      <h2 id="potato-research-title">Experimental potato leaf image analysis</h2>
      <p>
        This research feature classifies a leaf photograph; it is separate from satellite-based
        crop monitoring and does not provide a confirmed disease diagnosis.
      </p>
      {statusError && <p role="alert">{statusError}</p>}
      {modelAvailable === null && !statusError && <p role="status">Checking whether an experimental model is available…</p>}
      {modelAvailable === false && !statusError && (
        <p role="status">
          The dataset pipeline is registered, but no potato model has been trained. Image analysis
          is unavailable until an experimental model is trained.
        </p>
      )}
      {modelAvailable && (
        <>
          <label>
            Potato leaf photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={chooseImage}
              aria-label="Choose potato leaf photo"
            />
          </label>
          <p className="quiet">JPEG, PNG or WebP, maximum 5 MB. Do not upload sensitive images.</p>
          {preview && <img src={preview} alt="Selected potato leaf preview" className="scouting-photo-preview" />}
          <button type="button" className="primary-action" disabled={!file || loading} onClick={() => void analyze()}>
            {loading ? 'Analyzing…' : 'Analyze potato leaf'}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status" aria-live="polite">
          <h3>Experimental result: {result.prediction}</h3>
          <p>Model probability: {(result.probability * 100).toFixed(2)}%</p>
          <ul>{result.predictions.map(item => (
            <li key={item.label}>{item.label}: {(item.probability * 100).toFixed(2)}%</li>
          ))}</ul>
          <ul>{result.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul>
          <p className="quiet">{result.disclaimer} Verify symptoms in the field with a qualified agricultural expert before treatment.</p>
        </div>
      )}
    </section>
  );
}
