import 'dotenv/config';
import {generateGemini,ProviderError} from '../backend/api/services/ai/geminiProvider.ts';
try{
 const result=await generateGemini('Reply briefly.',[{role:'user',content:'Reply with READY.'}]);
 console.log(`PASS: live Gemini answer received (${result.model}).`);
}catch(error){
 console.error(error instanceof ProviderError?`FAIL [${error.code}]: ${error.message}`:'FAIL: Gemini check failed.');
 process.exitCode=1;
}
