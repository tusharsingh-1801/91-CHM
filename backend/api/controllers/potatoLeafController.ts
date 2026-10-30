import type { Request, Response } from 'express';
import { engineUrl } from '../services/satellite.ts';
import { decodeScoutingImage } from '../services/photoValidation.ts';

const expectedClasses = new Set(['Healthy', 'Early Blight', 'Late Blight']);

export async function getPotatoLeafStatus(_request: Request, response: Response) {
  response.setHeader('Cache-Control', 'no-store');
  try {
    const upstream = await fetch(`${engineUrl()}/research/potato-leaf`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) {
      response.status(503).json({ error: 'Potato research service is unavailable.' });
      return;
    }
    const result = await upstream.json() as { dataset_id?: unknown; model_available?: unknown };
    if (result.dataset_id !== 'pldd-up-potato-leaf-disease' || typeof result.model_available !== 'boolean') {
      response.status(502).json({ error: 'Invalid potato research service response.' });
      return;
    }
    response.json({ dataset_id: result.dataset_id, model_available: result.model_available });
  } catch (error) {
    console.error('Potato research status unavailable:', error instanceof Error ? error.name : 'unknown');
    response.status(503).json({ error: 'Potato research service is unavailable.' });
  }
}

export async function predictPotatoLeaf(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'no-store');
  const image = (request.body as { image?: unknown } | undefined)?.image;
  const decoded = decodeScoutingImage(image);
  if (!decoded) {
    response.status(400).json({ error: 'Choose a valid JPEG, PNG or WebP image under 5 MB.' });
    return;
  }

  try {
    const upstream = await fetch(`${engineUrl()}/research/potato-leaf/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: decoded.bytes.toString('base64') }),
      signal: AbortSignal.timeout(60000),
    });
    if (!upstream.ok) {
      response.status(upstream.status === 422 ? 422 : 503).json({
        error: upstream.status === 422
          ? 'The image could not be processed.'
          : 'The experimental potato model is not trained or is unavailable.',
      });
      return;
    }

    const result = await upstream.json() as {
      status?: unknown;
      crop?: unknown;
      dataset_id?: unknown;
      prediction?: unknown;
      probability?: unknown;
      predictions?: unknown;
      model?: unknown;
      dataset_provenance?: unknown;
      limitations?: unknown;
    };
    const predictions = result.predictions;
    const valid =
      result.status === 'experimental' &&
      result.crop === 'potato' &&
      result.dataset_id === 'pldd-up-potato-leaf-disease' &&
      typeof result.prediction === 'string' &&
      expectedClasses.has(result.prediction) &&
      typeof result.probability === 'number' &&
      Number.isFinite(result.probability) &&
      result.probability >= 0 &&
      result.probability <= 1 &&
      typeof result.model === 'string' &&
      typeof result.dataset_provenance === 'string' &&
      Array.isArray(result.limitations) &&
      result.limitations.length >= 3 &&
      result.limitations.every(item => typeof item === 'string') &&
      Array.isArray(predictions) &&
      predictions.length === expectedClasses.size &&
      predictions.every(item =>
        item !== null &&
        typeof item === 'object' &&
        'label' in item &&
        typeof item.label === 'string' &&
        expectedClasses.has(item.label) &&
        'probability' in item &&
        typeof item.probability === 'number' &&
        Number.isFinite(item.probability) &&
        item.probability >= 0 &&
        item.probability <= 1
      ) &&
      new Set(predictions.map(item => (item as { label: string }).label)).size === expectedClasses.size;

    if (!valid) {
      response.status(502).json({ error: 'Invalid experimental potato model response.' });
      return;
    }
    response.json({
      ...result,
      disclaimer:
        'Experimental potato leaf image classification only. Not a confirmed diagnosis, ' +
        'satellite observation, or field-level disease assessment.',
    });
  } catch (error) {
    console.error('Potato leaf inference unavailable:', error instanceof Error ? error.name : 'unknown');
    response.status(503).json({ error: 'The experimental potato model service is unavailable.' });
  }
}
