import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { askAssistant } from './assistantController.ts';

async function invoke(body: unknown) {
  let status = 200;
  let payload: any;
  const response = { locals:{account:{id:crypto.randomUUID()}},setHeader(){}, status(code: number) { status = code; return this; }, json(value: unknown) { payload = value; } };
  await askAssistant({ body } as Request, response as unknown as Response);
  return { status, payload };
}

test('assistant produces a visible answer with direct-answer generation settings', async () => {
  const key = process.env.GEMINI_API_KEY;
  const original = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    assert.ok(body.systemInstruction.parts[0].text);
    assert.equal(_url, `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL||'gemini-3.5-flash-lite'}:generateContent`);
    assert.equal((init.headers as Record<string,string>)['x-goog-api-key'], 'test-key');
    assert.equal(body.contents[0].role,'user');
    assert.equal(body.generationConfig.maxOutputTokens, 1024);
    assert.match(body.contents[0].parts[0].text, /No field was selected/);
    return new Response(JSON.stringify({modelVersion:'gemini-3.5-flash-lite',candidates:[{finishReason:'STOP',content:{parts:[{text:' नमस्ते! '}]}}]}));
  }) as typeof fetch;
  try {
    const { status, payload } = await invoke({ message: 'Hello', languageCode: 'hi-IN' });
    assert.equal(status, 200); assert.equal(payload.answer, 'नमस्ते!'); assert.equal(payload.languageCode, 'hi-IN');
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; }
});

test('assistant does not expose hidden reasoning as an answer and reports rate limits', async () => {
  const key = process.env.GEMINI_API_KEY;
  const original = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'Internal reasoning'}]}}]}))) as typeof fetch;
    const empty = await invoke({ message: 'Hello' });
    assert.equal(empty.status, 502); assert.match(empty.payload.error, /shorter question/); assert.equal(empty.payload.answer, undefined);
    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch;
    const limited = await invoke({ message: 'Hello' });
    assert.equal(limited.status, 429); assert.match(limited.payload.error, /limit/);
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; }
});

test('assistant rejects malformed user input without calling the provider', async () => {
  const key = process.env.GEMINI_API_KEY;
  const original = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  globalThis.fetch = (async () => { throw new Error('Must not call Gemini for invalid input'); }) as typeof fetch;
  try {
    for (const body of [undefined, { message: 42 }, { message: 'Hello', fieldId: 'bad' }, { message: 'Hello', languageCode: {} }]) {
      assert.equal((await invoke(body)).status, 400);
    }
  } finally { globalThis.fetch = original; if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; }
});

test('assistant rejects missing or placeholder Gemini credentials without a provider request', async () => {
  const key = process.env.GEMINI_API_KEY;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('Provider must not be called'); }) as typeof fetch;
  try {
    for (const value of ['', '  ', 'your-gemini-api-key']) {
      process.env.GEMINI_API_KEY = value;
      const result = await invoke({message:'Hello'});
      assert.equal(result.status,503);
      assert.match(result.payload.error,/Gemini AI is not configured/);
    }
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
  }
});
