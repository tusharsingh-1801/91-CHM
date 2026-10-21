import type { Request, Response } from 'express';
import { engineUrl } from '../services/satellite.ts';
import { decodeScoutingImage } from '../services/photoValidation.ts';

type Prediction = {
  label: string;
  probability: number;
};

type EngineResult = {
  status: string;
  crop: string;
  prediction: string;
  probability: number;
  predictions: Prediction[];
  model: string;
  disclaimer: string;
};

export async function predictMaize(
  request: Request,
  response: Response
) {
  response.setHeader('Cache-Control', 'no-store');

  const image = (request.body as { image?: unknown } | undefined)?.image;

  if (typeof image !== 'string' || !decodeScoutingImage(image)) {
    response.status(400).json({
      error: 'Choose a valid JPEG, PNG or WebP image under 5 MB.'
    });
    return;
  }

  try {
    const upstream = await fetch(`${engineUrl()}/predict-maize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: image.slice(image.indexOf(',') + 1)
      }),
      signal: AbortSignal.timeout(60000)
    });

    if (!upstream.ok) {
      response.status(
        upstream.status === 422 ? 422 : 503
      ).json({
        error: upstream.status === 422
          ? 'The image could not be processed.'
          : 'Maize prediction is temporarily unavailable.'
      });
      return;
    }

    const result = await upstream.json() as EngineResult;

    const valid =
      result.status === 'experimental' &&
      result.crop === 'maize' &&
      typeof result.prediction === 'string' &&
      typeof result.probability === 'number' &&
      Number.isFinite(result.probability) &&
      result.probability >= 0 &&
      result.probability <= 1 &&
      Array.isArray(result.predictions) &&
      result.predictions.length === 4 &&
      result.predictions.every(p =>
        typeof p.label === 'string' &&
        typeof p.probability === 'number' &&
        Number.isFinite(p.probability) &&
        p.probability >= 0 &&
        p.probability <= 1
      );

    if (!valid) {
      response.status(502).json({
        error: 'Invalid model response.'
      });
      return;
    }

    response.json({
      ...result,
      disclaimer:
        'Experimental maize leaf classification only. ' +
        'Not a confirmed diagnosis. Verify symptoms in the field.'
    });

  } catch (error) {
    console.error(
      'Maize inference unavailable:',
      error instanceof Error ? error.name : 'unknown'
    );

    response.status(503).json({
      error: 'Maize prediction service is unavailable.'
    });
  }
}
