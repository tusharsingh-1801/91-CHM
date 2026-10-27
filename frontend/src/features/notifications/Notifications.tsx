import {useEffect,useState,useRef} from 'react';
import {Link} from 'react-router-dom';
import {Bell,CheckCheck,CalendarCheck,TriangleAlert,CloudSun} from 'lucide-react';
import {loadFields,type DatabaseField} from '../../lib/api';
import {fieldAssessment} from '../../lib/fieldCopy';
import {usePreferences} from '../../lib/preferencesContext';
import {useDisclosureDismiss} from '../../lib/useDisclosureDismiss';

type Notice={id:string;field:string;title:string;href:string;kind:'visit'|'task'|'job'|'imagery'|'visits'|'processing'|'weather';read_at?:string|null};
type Preferences={visits:boolean;imagery:boolean;processing:boolean;weather:boolean;browser:boolean};
const defaults:Preferences={visits:true,imagery:true,processing:true,weather:true,browser:false};
type ServerNotice={id:string;field_name:string;title_en:string;title_hi:string;href:string;kind:Notice['kind'];read_at:string|null};
export function Notifications({accountId}:{accountId:string}){
 const {t,language}=usePreferences();
 const disclosure=useDisclosureDismiss();
 const deliveredMemory=useRef(new Set<string>());
 const [fields,setFields]=useState<DatabaseField[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const [server,setServer]=useState<ServerNotice[]|null>(null);
 const [mode,setMode]=useState('local');
 const [preferences,setPreferences]=useState<Preferences>(defaults);
 const [settingsError,setSettingsError]=useState('');
 const [browserStatus,setBrowserStatus]=useState('');
 const [preferenceBusy,setPreferenceBusy]=useState(false);
 const storageKey='terrascope:read-notifications:'+accountId;
 const [read,setRead]=useState<string[]>(()=>{try{const saved:unknown=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(saved)?saved.filter((id):id is string=>typeof id==='string'):[];}catch{return [];}});
 useEffect(()=>{
  let active=true;
  const update=()=>{void (async()=>{
   const response=await fetch('/api/notifications');if(!response.ok)throw Error('Notifications unavailable');
   const payload=await response.json();if(!Array.isArray(payload.notifications))throw Error('Invalid notification response');
   if(!active)return;setMode(payload.mode||'account');let savedPreferences={};if(payload.mode==='local')try{savedPreferences=JSON.parse(localStorage.getItem('terrascope:read-notifications:'+accountId+':preferences')||'{}');}catch{}setPreferences({...defaults,...payload.preferences,...savedPreferences});
   if(payload.mode==='local'){const value=await loadFields();if(active){setFields(value);setServer(null);}}
   else setServer(payload.notifications);
   if(active)setError(false);
  })().catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});};
  update();const timer=window.setInterval(update,60000);window.addEventListener('focus',update);
  return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',update);};
 },[refresh,accountId]);
 const derived:Notice[]=fields.flatMap(field=>{
  const entries:Notice[]=[];
  if(fieldAssessment(field).state==='needs_inspection')entries.push({id:`visit:${field.id}:${field.latest_scene_id||field.latestObservation?.scene_id||field.last_observation||''}:${field.boundary_version||1}`,field:field.name,title:t('A field visit is recommended','खेत की जाँच करें'),href:`/fields/${field.id}/map`,kind:'visit'});
  if(Number(field.dueTasks)>0)entries.push({id:`task:${field.id}:${field.dueTasks}:${new Date().toLocaleDateString('en-CA')}`,field:field.name,title:t(`${field.dueTasks} planned tasks due`,`${field.dueTasks} तय काम बाकी`),href:`/fields/${field.id}/overview#planned-tasks`,kind:'task'});
  if(field.latestJob?.status==='failed')entries.push({id:`job:${field.latestJob.id}`,field:field.name,title:t('Image or weather update needs a retry','तस्वीर या मौसम अपडेट फिर करें'),href:`/fields/${field.id}/overview`,kind:'job'});
  return entries;
 });
 const category=(item:Notice):keyof Preferences=>item.kind==='task'?'visits':item.kind==='visit'?'imagery':item.kind==='job'?'processing':item.kind;
 const notices:Notice[]=(server?server.map(item=>({id:item.id,field:item.field_name,title:language==='hi'?item.title_hi:item.title_en,href:item.href,kind:item.kind,read_at:item.read_at})):derived).filter(item=>preferences[category(item)]);
 const isRead=(item:Notice)=>server?Boolean(item.read_at):read.includes(item.id);
 const unread=notices.filter(item=>!isRead(item)).length;
 const markRead=async(ids:string[])=>{
  if(server){try{const response=await fetch('/api/notifications/read',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});if(!response.ok)throw Error('Read state unavailable');setServer(current=>current?.map(item=>ids.includes(item.id)?{...item,read_at:new Date().toISOString()}:item)||null);}catch{setSettingsError(t('Could not save read status. Retry.','पढ़ने की स्थिति सेव नहीं हुई। फिर कोशिश करें।'));}return;}
  const next=[...new Set([...read,...ids])].slice(-500);setRead(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Keep this session usable without storage. */}
 };
 const savePreferences=async(next:Preferences)=>{setPreferenceBusy(true);setSettingsError('');try{
  if(mode==='account'){const response=await fetch('/api/notifications/preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});if(!response.ok)throw Error('Preferences unavailable');}
  else localStorage.setItem(storageKey+':preferences',JSON.stringify(next));
  setPreferences(next);
 }catch{setSettingsError(t('Could not save notification preferences.','सूचनाओं की पसंद सेव नहीं हुई।'));}finally{setPreferenceBusy(false);}};
 useEffect(()=>{
  if(!preferences.browser||!('Notification' in window)||Notification.permission!=='granted')return;
  const storage='terrascope:delivered:'+accountId;
  let delivered:string[]=[];try{const saved=JSON.parse(sessionStorage.getItem(storage)||'[]');if(Array.isArray(saved))delivered=saved;}catch{/* No previous delivery state. */}
  const fresh=notices.filter(item=>!isRead(item)&&!delivered.includes(item.id)&&!deliveredMemory.current.has(item.id));if(!fresh.length)return;for(const item of notices)deliveredMemory.current.add(item.id);
  try{sessionStorage.setItem(storage,JSON.stringify([...new Set([...delivered,...notices.map(item=>item.id)])].slice(-500)));}catch{/* Current delivery is still bounded to one item. */}
  void (async()=>{try{const options={body:t('A field update is available. Open TerraScope to review it.','खेत का नया अपडेट है। TerraScope में देखें।'),tag:'terrascope-field-update',data:{path:fresh[0].href}};const registration='serviceWorker' in navigator?await navigator.serviceWorker.getRegistration():null;if(registration)await registration.showNotification('TerraScope',options);else new Notification('TerraScope',options);}catch{setBrowserStatus(t('Browser delivery is unavailable here. In-app notifications remain available.','यहाँ ब्राउज़र सूचना नहीं भेज सका। ऐप की सूचनाएँ उपलब्ध हैं।'));}})();
 });
 return <details className="header-disclosure notification-menu" ref={disclosure} onToggle={event=>{if(event.currentTarget.open)setRefresh(value=>value+1);}}>
  <summary className="header-icon-button" aria-label={t(`Notifications, ${unread} unread`,`सूचनाएँ, ${unread} नई`)}><Bell size={21} aria-hidden="true"/>{unread>0&&<span className="notification-count" aria-hidden="true">{unread>99?'99+':unread}</span>}</summary>
  <section className="header-popover notification-popover" aria-label={t('Notifications','सूचनाएँ')}>
   <div className="notification-heading"><div><strong>{t('Notifications','सूचनाएँ')}</strong><small aria-live="polite">{t(`${unread} unread`,`${unread} नई`)}</small></div>{unread>0&&<button type="button" className="notification-read-all" onClick={()=>void markRead(notices.map(item=>item.id))}><CheckCheck size={16} aria-hidden="true"/>{t('Mark all read','सब पढ़ा हुआ करें')}</button>}</div>
   {loading&&<p role="status">{t('Loading notifications…','सूचनाएँ लोड हो रही हैं…')}</p>}
   {error&&<p role="alert">{t('Notifications could not refresh.','सूचनाएँ अपडेट नहीं हुईं।')} <button type="button" onClick={()=>setRefresh(value=>value+1)}>{t('Retry','फिर कोशिश करें')}</button></p>}
   {!loading&&!error&&!notices.length&&<div className="notification-empty"><Bell size={26} aria-hidden="true"/><strong>{t('You’re all caught up','अभी कोई नया काम नहीं')}</strong><p>{t('Field visits, due tasks and failed updates will appear here.','खेत की जाँच, बाकी काम और रुके अपडेट यहाँ दिखेंगे।')}</p></div>}
   <ul className="notification-list">{notices.map(item=>{const Icon=['task','visits'].includes(item.kind)?CalendarCheck:['job','processing','weather'].includes(item.kind)?CloudSun:TriangleAlert;return <li key={item.id}><Link className={isRead(item)?'notification-item':'notification-item is-unread'} to={item.href} onClick={()=>{void markRead([item.id]);if(disclosure.current)disclosure.current.open=false;}}><span className={`notification-symbol notice-${item.kind}`}><Icon size={18} aria-hidden="true"/></span><span><strong>{item.field}</strong><small>{item.title}</small></span>{!isRead(item)&&<i className="notification-unread-dot" aria-label={t('Unread','नई')}/>}</Link></li>;})}</ul>
   <div className="notification-settings"><details><summary>{t('Notification preferences','सूचनाओं की पसंद')}</summary>{(['visits','imagery','processing','weather'] as const).map(key=><label key={key}><input type="checkbox" checked={preferences[key]} disabled={preferenceBusy} onChange={event=>void savePreferences({...preferences,[key]:event.target.checked})}/>{({visits:t('Visits and tasks','जाँच और काम'),imagery:t('Image quality and changes','तस्वीर की गुणवत्ता और बदलाव'),processing:t('Processing results','प्रोसेसिंग के नतीजे'),weather:t('Forecast information','पूर्वानुमान की जानकारी')})[key]}</label>)}<button type="button" disabled={preferenceBusy} onClick={async()=>{
    if(preferences.browser){await savePreferences({...preferences,browser:false});return;}
    if(!('Notification' in window)||!window.isSecureContext){setBrowserStatus(t('Browser notifications are unsupported here.','यहाँ ब्राउज़र सूचनाएँ समर्थित नहीं हैं।'));return;}
    if(Notification.permission==='denied'){setBrowserStatus(t('Permission was denied. Use browser settings to change it.','अनुमति नहीं है। बदलने के लिए ब्राउज़र सेटिंग देखें।'));return;}
    const permission=await Notification.requestPermission();if(permission==='granted'){try{sessionStorage.setItem('terrascope:delivered:'+accountId,JSON.stringify(notices.map(item=>item.id)));}catch{}await savePreferences({...preferences,browser:true});setBrowserStatus(t('Enabled while TerraScope is open.','TerraScope खुला रहने पर सूचनाएँ चालू हैं।'));}else setBrowserStatus(t('Permission was not granted. In-app notices remain available.','अनुमति नहीं मिली। ऐप की सूचनाएँ उपलब्ध हैं।'));
   }}>{preferences.browser?t('Disable browser notifications','ब्राउज़र सूचनाएँ बंद करें'):t('Enable browser notifications','ब्राउज़र सूचनाएँ चालू करें')}</button></details>{settingsError&&<p role="alert">{settingsError}</p>}{browserStatus&&<p aria-live="polite">{browserStatus}</p>}</div>
  </section>
 </details>;
}
