import {geminiConfigured} from '../assistantBudget.ts';
export class ProviderError extends Error {
 code:string;status:number;retryAfterSeconds?:number;
 constructor(code:string,message:string,status=502,retryAfterSeconds?:number){super(message);this.code=code;this.status=status;this.retryAfterSeconds=retryAfterSeconds;}
}
type Message={role:'user'|'assistant';content:string};
export async function generateGemini(system:string,messages:Message[],options:{fetcher?:typeof fetch;timeoutMs?:number}={}){
 if(!geminiConfigured())throw new ProviderError('not_configured','Gemini AI is not configured. Add GEMINI_API_KEY to the server environment.',503);
 const model=process.env.GEMINI_MODEL?.trim()||'gemini-3.5-flash-lite';
 if(!/^[a-zA-Z0-9._-]+$/.test(model))throw new ProviderError('invalid_model','Gemini model setting is invalid.',503);
 const signal=AbortSignal.timeout(options.timeoutMs??30000);
 try{
  const response=await (options.fetcher??fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
   method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_API_KEY!.trim(),'Content-Type':'application/json'},signal,
   body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:messages.map(item=>({role:item.role==='assistant'?'model':'user',parts:[{text:item.content}]})),generationConfig:{maxOutputTokens:1024,temperature:0.2}}),
  });
  const payload=await response.json().catch(()=>null) as {error?:{details?:Array<{reason?:string}>};modelVersion?:string;promptFeedback?:{blockReason?:string};candidates?:Array<{finishReason?:string;content?:{parts?:Array<{text?:string;thought?:boolean}>}}> }|null;
  if(!response.ok){
   const invalidKey=Array.isArray(payload?.error?.details)&&payload.error.details.some((item:{reason?:string})=>item.reason==='API_KEY_INVALID');
   const retry=response.headers.get('Retry-After');
   const seconds=retry?(/^\d+(\.\d+)?$/.test(retry)?Math.ceil(Number(retry)):Math.ceil((Date.parse(retry)-Date.now())/1000)):60;
   if(response.status===429)throw new ProviderError('rate_limited','Gemini request limit or free quota reached. Please wait and try again.',429,Number.isFinite(seconds)?Math.max(1,seconds):60);
   if(invalidKey||response.status===401)throw new ProviderError('invalid_credentials','Gemini API key was rejected. Check the Google AI Studio key.');
   if(response.status===403)throw new ProviderError('permission_denied','Gemini API access was denied. Check key restrictions and project access.');
   if(response.status===404)throw new ProviderError('model_unavailable','The configured Gemini model is unavailable.');
   throw new ProviderError(response.status===400?'invalid_request':'provider_unavailable','Gemini could not complete the request. Please check configuration or try again later.');
  }
  const candidate=payload?.candidates?.[0];
  if(payload?.promptFeedback?.blockReason||candidate?.finishReason==='SAFETY')throw new ProviderError('blocked','Gemini could not answer this question. Please rephrase it.');
  if(candidate?.finishReason==='MAX_TOKENS')throw new ProviderError('incomplete','Gemini could not finish an answer. Please try a shorter question.');
  if(candidate?.finishReason!=='STOP')throw new ProviderError('empty_output','Gemini returned no complete answer. Please try a shorter question.');
  const answer=(Array.isArray(candidate?.content?.parts)?candidate.content.parts:[]).filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('\n').trim();
  if(!answer)throw new ProviderError('empty_output','Gemini returned no answer. Please try a shorter question.');
  return {answer,model:typeof payload?.modelVersion==='string'?payload.modelVersion:model};
 }catch(error){
  if(error instanceof ProviderError)throw error;
  throw new ProviderError(signal.aborted?'timeout':'network',signal.aborted?'Gemini request timed out. Please try again.':'Gemini could not be reached. Please try again.',signal.aborted?504:503);
 }
}
