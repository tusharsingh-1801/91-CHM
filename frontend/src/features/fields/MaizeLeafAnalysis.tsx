import {useEffect,useState} from 'react';
import type {ChangeEvent} from 'react';
import {
  predictMaizeLeaf,
  type MaizePredictionResult
} from '../../lib/api';

function readableLabel(value:string) {
  const category = value.split('___').pop() || value;
  return category.replace(/_/g,' ').replace(/\s+/g,' ').trim();
}

export function MaizeLeafAnalysis({fieldId}:{fieldId:string}) {
  const [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState('');
  const [result,setResult] = useState<MaizePredictionResult|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [generation,setGeneration] = useState(0);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  },[preview]);

  useEffect(() => {
    setFile(null);
    setPreview('');
    setResult(null);
    setError('');
    setGeneration(value => value+1);
  },[fieldId]);

  function chooseImage(event:ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    setGeneration(value => value+1);
    setFile(null);
    setPreview('');
    setResult(null);
    setError('');

    if (!selected) return;

    if (
      !['image/jpeg','image/png','image/webp'].includes(selected.type) ||
      selected.size > 5*1024*1024
    ) {
      setError('Choose a JPEG, PNG or WebP image under 5 MB.');
      return;
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function analyze() {
    if (!file || loading) return;

    const submittedFieldId = fieldId;
    const currentGeneration = generation;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const image = await new Promise<string>((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Unable to read image'));
        reader.onerror = () => reject(new Error('Unable to read image'));
        reader.readAsDataURL(file);
      });

      const prediction = await predictMaizeLeaf(submittedFieldId,image);

      if (currentGeneration === generation) {
        setResult(prediction);
      }
    } catch (cause) {
      if (currentGeneration === generation) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Analysis failed. Please try again.'
        );
      }
    } finally {
      if (currentGeneration === generation) {
        setLoading(false);
      }
    }
  }

  return (
    <section
      aria-labelledby="maize-analysis-title"
      style={{padding:'1rem',marginBlock:'1rem',border:'1px solid #a3a3a3',borderRadius:'12px'}}
    >
      <h3 id="maize-analysis-title">Maize Leaf Analysis (Experimental)</h3>
      <p>
        मक्के के पत्ते की फोटो अपलोड करें।
        This research model recognizes four maize leaf conditions.
      </p>

      <label>
        Maize leaf photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={chooseImage}
          aria-label="Choose maize leaf photo"
        />
      </label>

      <p className="quiet">JPEG, PNG or WebP, maximum 5 MB.</p>

      {preview && (
        <img
          src={preview}
          alt="Selected maize leaf"
          className="scouting-photo-preview"
        />
      )}

      <div>
        <button
          type="button"
          className="primary-action"
          onClick={() => void analyze()}
          disabled={!file || loading}
        >
          {loading ? 'Analyzing…' : 'Analyze maize leaf'}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      {result && (
        <div role="status" aria-live="polite">
          <h4>Prediction: {readableLabel(result.prediction)}</h4>
          <p>
            Model probability: {(result.probability*100).toFixed(2)}%
          </p>

          <h4>All predicted classes</h4>
          <ul>
            {result.predictions.map(item => (
              <li key={item.label}>
                {readableLabel(item.label)}:
                {' '}{(item.probability*100).toFixed(2)}%
              </li>
            ))}
          </ul>

          <p className="quiet">
            Experimental AI result only. These probabilities
            are not verified diagnostic confidence.
            Confirm symptoms through a field inspection or
            qualified agricultural expert before treatment.
          </p>
        </div>
      )}
    </section>
  );
}
