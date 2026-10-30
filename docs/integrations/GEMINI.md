# Gemini crop assistant

Gemini is the only external chat provider. The backend calls Google's native `generateContent` endpoint with server-only `x-goog-api-key` authentication. Sarvam and Grok routes, clients, checks and credentials have been removed.

Set these values in the project-root `.env`, then restart the API:

```dotenv
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Create the key in [Google AI Studio](https://aistudio.google.com/apikey). The assistant status endpoint only reports whether a key is configured; it does not verify provider connectivity. A real chat request checks access and consumes API quota, and may incur charges on a paid project. Keep the project on Google's Free tier if free-only use is required; the application cannot select or enforce your Google billing tier. Google lists free input/output for this model, subject to project limits. No automatic retries, paid fallback, search tools or other paid features are configured. There is no standalone Gemini check script in the current package scripts.

`POST /api/assistant` requires authentication and validates field ownership. It retains Hindi/English support, accepted satellite evidence, weather context and optional saved conversation history. Questions and selected field context are sent to Google; recent saved history is included only when the user enables history. Google's free-tier terms allow product improvement use of submitted content. Avoid sensitive personal information.

Requests have a 30-second deadline and 1,024 output-token cap. Responses return only visible text, excluding thought parts. Blocked, incomplete and empty results are explicit errors. Quota failures return HTTP 429 and Retry-After. Credentials and raw provider errors are never returned to clients.

Verification: `npm test`, `npm run build`, and `npm run test:ui -- tests/ui/assistant-providers.spec.ts` use mocked inference. Live verification requires a valid `GEMINI_API_KEY`.

Official references: [generateContent](https://ai.google.dev/api/generate-content), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

Historical live verification on 2026-10-22 reported success with `gemini-3.5-flash-lite`. It does not confirm current key access or provider availability.
