import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';

export async function askAssistant(request: Request, response: Response) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey.startsWith('your-')) {
    response.status(503).json({ error: 'Sarvam AI is not configured' });
    return;
  }
  const { message, fieldId, languageCode } = request.body as { message?: string; fieldId?: string; languageCode?: string };
  if (!message?.trim() || message.trim().length > 2000) {
    response.status(400).json({ error: 'message is required and must be under 2000 characters' });
    return;
  }
  try {
    let fieldContext = 'No field was selected.';
    if (fieldId) {
      const fieldResult = await pool.query('select name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation from public.fields where id = $1', [fieldId]);
      const field = fieldResult.rows[0];
      if (!field) { response.status(404).json({ error: 'Field not found' }); return; }
      const ndviResult = await pool.query('select observed_on, ndvi_value, cloud_cover, source from public.ndvi_observations where field_id = $1 order by observed_on desc limit 5', [fieldId]);
      fieldContext = JSON.stringify({ field, recentNdvi: ndviResult.rows });
    }
    const targetLanguage = languageCode?.trim() || 'en-IN';
    const sarvamResponse = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.SARVAM_MODEL ?? 'sarvam-105b',
        messages: [
          { role: 'system', content: `You are TerraScope's crop-health assistant. Answer for a field manager using the supplied field data only. Explain technical terms such as NDVI in plain language, never invent measurements, and clearly say when data is missing. Reply in ${targetLanguage}. Give practical next steps, but do not prescribe pesticides, fertilizer rates, or medical advice.` },
          { role: 'user', content: `Field context: ${fieldContext}\n\nQuestion: ${message.trim()}` },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!sarvamResponse.ok) {
      console.error('Sarvam AI request failed:', sarvamResponse.status);
      response.status(502).json({ error: 'Sarvam AI request failed' });
      return;
    }
    const payload = await sarvamResponse.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) { response.status(502).json({ error: 'Sarvam AI returned an empty answer' }); return; }
    response.json({ answer, model: payload.model ?? process.env.SARVAM_MODEL ?? 'sarvam-105b', languageCode: targetLanguage });
  } catch (error) {
    console.error('POST /api/assistant failed:', error);
    const messageText = error instanceof DOMException && error.name === 'TimeoutError' ? 'Sarvam AI request timed out' : 'Assistant unavailable';
    response.status(504).json({ error: messageText });
  }
}

