import {useAccountSettings} from '../auth/AccountSettingsContext';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { askFieldAssistant } from '../../lib/api';
import { usePreferences } from '../../lib/preferencesContext';

type Message = { id:string; role: 'user'|'assistant'; text: string };
const prompts=[
 ['Why is NDVI decreasing?', 'NDVI कम क्यों हो रहा है?'],
 ['What should I inspect in my field?', 'खेत में क्या जाँच करनी चाहिए?'],
 ['Explain the weather data', 'मौसम की जानकारी समझाएँ'],
 ['Explain the image quality', 'तस्वीर की गुणवत्ता समझाएँ'],
 ['Explain the before and after comparison', 'पहले और बाद की तुलना समझाएँ'],
] as const;

export function CropAssistant() {
  const { t, language } = usePreferences();
  const location = useLocation();
  const { fieldId } = useParams();
  const match = location.pathname.match(/^\/fields\/([0-9a-f-]{36})(?:\/|$)/i);
  const selectedField = fieldId || match?.[1];
  const [open, setOpen] = useState(false);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const account=useAccountSettings();
  const contextKey=(account.email||'local')+':'+(selectedField||'general');
  const question=drafts[contextKey]||'';
  const setQuestion=(text:string)=>setDrafts(current=>({...current,[contextKey]:text}));
  const activeContext=useRef(contextKey);activeContext.current=contextKey;
  const [busyContext,setBusyContext]=useState<string|null>(null);const busy=busyContext===contextKey;
  const [errorValue,setErrorValue]=useState({key:'',text:''});const error=errorValue.key===contextKey?errorValue.text:'';
  const setError=(text:string)=>setErrorValue({key:contextKey,text});
  const [conversations,setConversations]=useState<Record<string,Message[]>>({});
  const messages=conversations[contextKey]||[];
  const setMessages=(update:(items:Message[])=>Message[])=>setConversations(current=>({...current,[contextKey]:update(current[contextKey]||[])}));
  const [saveHistory,setSaveHistory]=useState(false);
  const [contextName,setContextName]=useState('');
  const [availability,setAvailability]=useState<boolean|undefined>(undefined);
  const sending=useRef(false);
  useEffect(()=>{
    if(!open)return;let active=true;
    void fetch('/api/assistant/status').then(response=>response.json()).then(value=>{if(active)setAvailability(value.configured);}).catch(()=>{});
    if(selectedField)void fetch('/api/fields').then(response=>response.json()).then(value=>{if(active&&Array.isArray(value))setContextName(value.find(item=>item.id===selectedField)?.name||'');}).catch(()=>{});
    if(saveHistory)void fetch('/api/assistant/history'+(selectedField?'?fieldId='+selectedField:'')).then(response=>{if(!response.ok)throw Error('History unavailable');return response.json();}).then(value=>{if(active&&Array.isArray(value))setConversations(current=>current[contextKey]?.length?current:({...current,[contextKey]:value.filter(item=>['user','assistant'].includes(item.role)&&typeof item.content==='string').map((item,index)=>({id:`history-${index}`,role:item.role,text:item.content}))}));}).catch(()=>{if(active)setErrorValue({key:contextKey,text:'Saved conversation could not load. Your current chat remains available.'});});
    return()=>{active=false;};
  },[open,saveHistory,selectedField,contextKey]);

  useEffect(() => {
    const onQuestion=(event:Event)=>{
      const detail=(event as CustomEvent<{question?:string}>).detail;
      if(typeof detail?.question === 'string')setQuestion(detail.question);
      setOpen(true);
    };
    window.addEventListener('terrascope:assistant-question',onQuestion);
    return ()=>window.removeEventListener('terrascope:assistant-question',onQuestion);
  },[contextKey]);


  async function send(text:string) {
    const value = text.trim();
    if (!value || sending.current) return;
    sending.current=true;
    const messageId=crypto.randomUUID();
    setError('');
    setMessages(current => [...current, { id:messageId, role:'user', text:value }]);
    setQuestion('');
    setBusyContext(contextKey);
    try {
      const response = await askFieldAssistant(value, selectedField, language === 'hi' ? 'hi-IN' : 'en-IN',saveHistory);
      setMessages(current => [...current, { id:crypto.randomUUID(), role:'assistant', text:response.answer }]);
      if(saveHistory&&response.historySaved===false)setError(t('Reply received, but the conversation could not be saved.','जवाब मिल गया, पर बातचीत सेव नहीं हुई।'));
    } catch (reason) {
      setMessages(current=>current.filter(message=>message.id!==messageId));
      if(activeContext.current===contextKey)setQuestion(value);
      setError(reason instanceof Error ? reason.message : t('Assistant unavailable','सहायक उपलब्ध नहीं है'));
    } finally { sending.current=false;setBusyContext(current=>current===contextKey?null:current); }
  }
  function submit(event:FormEvent) { event.preventDefault(); void send(question); }
  return <>
    <button className="crop-assistant-launch no-print" type="button" onClick={() => setOpen(current => !current)} aria-expanded={open} aria-controls="crop-assistant-window" aria-label={t('Ask crop assistant','फ़सल सहायक से पूछें')}>
      <MessageCircle size={22} aria-hidden="true"/><span>{t('Ask AI','AI से पूछें')}</span>
    </button>
    {open && <section id="crop-assistant-window" className="crop-assistant-window no-print" aria-label={t('Crop assistant chat','फ़सल सहायक चैट')}>
      <header className="crop-assistant-header">
        <div><strong><Bot size={21} aria-hidden="true"/> {t('Crop assistant','फ़सल सहायक')}</strong><small>Gemini AI{selectedField ? ' · '+(contextName||t('Selected field','चुना हुआ खेत')) : ''}</small></div>
        <button type="button" aria-label={t('Close assistant','सहायक बंद करें')} onClick={() => setOpen(false)}><X size={20}/></button>
      </header>
      <div className="assistant-history-controls"><small>{availability===false?t('Provider not configured','सेवा कॉन्फ़िगर नहीं है'):availability===true?t('Provider configured · availability checked on send','सेवा कॉन्फ़िगर है · भेजने पर कनेक्शन जाँचा जाएगा'):t('Provider status unavailable','सेवा की स्थिति उपलब्ध नहीं')}</small>{account.signedIn&&<label><input type="checkbox" disabled={busy} checked={saveHistory} onChange={event=>setSaveHistory(event.target.checked)}/>{t('Save conversation history','बातचीत का इतिहास सेव करें')}</label>}{saveHistory&&<button type="button" disabled={busy} onClick={async()=>{try{const response=await fetch('/api/assistant/history',{method:'DELETE'});if(!response.ok)throw Error('Could not clear saved history');setConversations({});}catch{setError(t('Could not clear saved history','इतिहास हट नहीं पाया'));}}}>{t('Clear all saved history','पूरा सेव किया इतिहास हटाएँ')}</button>}</div>
      <div className="crop-assistant-messages" role="log" aria-live="polite" aria-relevant="additions text">
        {!messages.length && <><p className="crop-assistant-intro">{t('Ask about your crop, satellite pictures or weather.', 'फ़सल, सैटेलाइट तस्वीर और मौसम के बारे में पूछें।')}</p>
          <div className="crop-assistant-prompts">{prompts.map(([en,hi])=><button key={en} type="button" onClick={() => void send(t(en,hi))} disabled={busyContext!==null}>{t(en,hi)}</button>)}</div>
        </>}
        {messages.map(message=><p key={message.id} className={message.role === 'user' ? 'assistant-user-message' : 'assistant-answer-message'}><span>{message.role==='user' ? t('You','आप') : t('Assistant','सहायक')}</span>{message.text}</p>)}
        {busy && <p role="status">{t('Writing reply…','जवाब तैयार हो रहा है…')}</p>}
      </div>
      {error && <p className="crop-assistant-error" role="alert">{error}</p>}
      <form className="crop-assistant-input" onSubmit={submit}>
        <label className="sr-only" htmlFor="crop-assistant-question">{t('Your question','आपका सवाल')}</label>
        <input id="crop-assistant-question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder={t('Ask a question…','अपना सवाल लिखें…')} maxLength={2000}/>
        <button type="submit" disabled={busyContext!==null || !question.trim()} aria-label={t('Send question','सवाल भेजें')}><Send size={18}/></button>
      </form>
    </section>}
  </>;
}
