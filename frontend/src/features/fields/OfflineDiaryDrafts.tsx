import {useEffect,useState,type FormEvent} from 'react';
import {CloudOff,CloudUpload,Save,Trash2,Wifi} from 'lucide-react';
import {createFieldEvent,type FieldEvent} from '../../lib/api';
import {readDiaryDrafts,writeDiaryDrafts,type DiaryDraft} from '../../lib/diaryDrafts';
import {usePreferences} from '../../lib/preferencesContext';
import './diary-drafts.css';
import { eventLabel } from '../../lib/eventLabels';

const eventKinds=['scouting','irrigation','fertilizer','planting','pesticide','harvest','other'];
export function OfflineDiaryDrafts({fieldId,onSynced}:{fieldId:string;onSynced:(event:FieldEvent)=>void}){
 const {t,date}=usePreferences();
 const [drafts,setDrafts]=useState<DiaryDraft[]>(()=>readDiaryDrafts(fieldId));
 const [online,setOnline]=useState(()=>navigator.onLine);
 const [eventType,setEventType]=useState('scouting');
 const [eventDate,setEventDate]=useState(()=>new Date().toLocaleDateString('en-CA'));
 const [notes,setNotes]=useState('');
 const [editing,setEditing]=useState<string|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [message,setMessage]=useState('');
 useEffect(()=>{setDrafts(readDiaryDrafts(fieldId));setEditing(null);setMessage('');},[fieldId]);
 useEffect(()=>{
  const sync=()=>setOnline(navigator.onLine);
  window.addEventListener('online',sync);window.addEventListener('offline',sync);
  return ()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync);};
 },[]);
 const persist=(next:DiaryDraft[])=>{
  if(!writeDiaryDrafts(fieldId,next)){setMessage(t('Local storage is unavailable or full. Copy your note before leaving.','लोकल स्टोरेज उपलब्ध नहीं है। जाने से पहले नोट कॉपी करें।'));return false;}
  setDrafts(next);return true;
 };
 const reset=()=>{setEditing(null);setNotes('');setEventType('scouting');setEventDate(new Date().toLocaleDateString('en-CA'));};
 const save=(event:FormEvent)=>{
  event.preventDefault();setMessage('');
  if(!eventDate||eventDate>new Date().toLocaleDateString('en-CA')||notes.length>4000)return;
  const updated:DiaryDraft={id:editing||crypto.randomUUID(),fieldId,eventType,eventDate,notes,savedAt:new Date().toISOString()};
  const next=[updated,...drafts.filter(draft=>draft.id!==updated.id)].slice(0,30);
  if(persist(next)){reset();setMessage(t('Draft saved on this device. Not yet sent to the server.','ड्राफ्ट इस डिवाइस पर सेव है। सर्वर पर अभी नहीं भेजा गया।'));}
 };
 async function submit(draft:DiaryDraft){
  if(!navigator.onLine){setMessage(t('You are offline. Reconnect before sending.','इंटरनेट बंद है। भेजने से पहले कनेक्ट करें।'));return;}
  if(!window.confirm(t('Send this saved field event to the server? Do not retry if you are unsure whether a previous submission succeeded.','यह नोट सर्वर पर भेजें? यदि पहले भेजे जाने की पुष्टि नहीं है, तो दोबारा भेजने से पहले जाँच करें।')))return;
  setBusy(draft.id);setMessage('');
  try{
   const saved=await createFieldEvent(fieldId,draft.eventType,draft.eventDate,draft.notes);
   onSynced(saved);
   if(persist(drafts.filter(item=>item.id!==draft.id)))setMessage(t('Event saved on server and local draft cleared.','रिकॉर्ड सर्वर पर सेव हुआ और लोकल ड्राफ्ट हटाया गया।'));
  }catch{setMessage(t('Could not confirm delivery. Draft kept. Check recorded field work before retrying to avoid duplicates.','भेजने की पुष्टि नहीं हुई। ड्राफ्ट सुरक्षित है। दोबारा भेजने से पहले दर्ज किए गए काम जाँचें।'));}
  finally{setBusy(null);}
 }
 const edit=(draft:DiaryDraft)=>{setEditing(draft.id);setEventType(draft.eventType);setEventDate(draft.eventDate);setNotes(draft.notes);setMessage('');};
 return <section className="offline-diary-drafts" aria-label={t('Offline field-note drafts','ऑफ़लाइन खेत नोट ड्राफ्ट')}>
  <h3>{online?<Wifi size={19}/>:<CloudOff size={19}/>} {t('Field note drafts · device only','खेत के ड्राफ्ट · इसी डिवाइस पर')}</h3>
  <p>{t('Save a note even without internet, then send it when you are back online.','बिना इंटरनेट के भी नोट सेव करें। इंटरनेट आने पर भेजें।')}</p>
  <p className="draft-connection" role="status">{online?t('Connected — ready to send saved drafts','कनेक्टेड — सेव ड्राफ्ट भेज सकते हैं'):t('Offline — drafts remain on this device','ऑफ़लाइन — ड्राफ्ट इसी डिवाइस में रहेंगे')}</p>
  <form onSubmit={save}><label>{t('Event type','काम का प्रकार')}<select value={eventType} onChange={e=>setEventType(e.target.value)}>{eventKinds.map(kind=><option value={kind} key={kind}>{eventLabel(t,kind)}</option>)}</select></label>
   <label>{t('Observation date','जाँच की तारीख़')}<input type="date" required max={new Date().toLocaleDateString('en-CA')} value={eventDate} onChange={e=>setEventDate(e.target.value)}/></label>
   <label>{t('Notes','नोट')}<textarea aria-label={t('Offline note text','ऑफ़लाइन नोट')} rows={3} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   <div className="draft-actions"><button type="submit" disabled={Boolean(busy)}><Save size={16}/>{editing?t('Update local draft','ड्राफ्ट अपडेट करें'):t('Save offline draft','ऑफ़लाइन ड्राफ्ट सेव करें')}</button>{editing&&<button type="button" onClick={reset}>{t('Cancel editing','एडिट बंद करें')}</button>}</div>
  </form>
  <h4>{t('Saved drafts','सेव ड्राफ्ट')} ({drafts.length})</h4>
  {drafts.length?<ul>{drafts.map(draft=><li key={draft.id}><div><strong>{eventLabel(t,draft.eventType)}</strong><small>{date(draft.eventDate)} · {t('Saved','सेव')} {date(draft.savedAt)}</small><p>{draft.notes||t('No note text','कोई नोट नहीं')}</p></div><div className="draft-actions"><button type="button" disabled={Boolean(busy)} onClick={()=>edit(draft)}>{t('Edit','एडिट')}</button><button type="button" disabled={Boolean(busy)||!online} onClick={()=>void submit(draft)}><CloudUpload size={15}/>{busy===draft.id?t('Sending…','भेज रहे हैं…'):t('Send to diary','डायरी में भेजें')}</button><button type="button" disabled={Boolean(busy)} onClick={()=>{if(window.confirm(t('Delete this local draft?','यह ड्राफ्ट हटाएँ?')))persist(drafts.filter(item=>item.id!==draft.id));}} aria-label={t('Delete draft','ड्राफ्ट हटाएँ')}><Trash2 size={15}/></button></div></li>)}</ul>:<p>{t('No offline drafts saved.','कोई ऑफ़लाइन ड्राफ्ट नहीं है।')}</p>}
  {message&&<p role="status" className="draft-feedback">{message}</p>}
  <small>{t('Drafts stay on this device until you send or delete them.','ड्राफ्ट इसी डिवाइस पर रहते हैं, जब तक आप भेजें या हटाएँ नहीं।')}</small>
 </section>;
}
