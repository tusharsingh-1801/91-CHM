import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateGemini,ProviderError} from './ai/geminiProvider.ts';
test('Gemini contract parses visible text and safely handles failures without retries',async()=>{
 const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';
 const invoke=(payload:unknown,status=200,headers?:Record<string,string>)=>generateGemini('System',[{role:'user',content:'Question'},{role:'assistant',content:'Earlier answer'}],{fetcher:(async(_url,init)=>{
  const body=JSON.parse(String(init?.body));assert.equal(body.contents[1].role,'model');assert.equal(body.systemInstruction.parts[0].text,'System');
  return Response.json(payload,{status,headers});
 }) as typeof fetch});
 try{
  const result=await invoke({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'SECRET'},{text:'Visible answer'}]}}]});assert.equal(result.answer,'Visible answer');
  for(const [payload,status,code] of [
   [{error:{details:[{reason:'API_KEY_INVALID'}]}},400,'invalid_credentials'],[{},401,'invalid_credentials'],[{},403,'permission_denied'],[{},404,'model_unavailable'],[{},429,'rate_limited'],[{},500,'provider_unavailable'],
   [{promptFeedback:{blockReason:'SAFETY'}},200,'blocked'],[{candidates:[{finishReason:'MAX_TOKENS'}]},200,'incomplete'],[{},200,'empty_output'],
   [{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'SECRET'}]}}]},200,'empty_output'],
  ] as const){await assert.rejects(invoke(payload,status),error=>error instanceof ProviderError&&error.code===code&&!error.message.includes('SECRET'));}
  await assert.rejects(invoke({},429,{'Retry-After':'120'}),error=>error instanceof ProviderError&&error.retryAfterSeconds===120);
  await assert.rejects(generateGemini('S',[],{timeoutMs:1,fetcher:((_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error())))) as typeof fetch}),error=>error instanceof ProviderError&&error.code==='timeout');
 }finally{if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;}
});
