import {useCallback,useEffect,useMemo,useState} from 'react';
import {Bell,Check,RefreshCw} from 'lucide-react';
import {Link} from 'react-router-dom';
import {loadFieldAlerts,loadFieldTasks,updateFieldAlert,updateFieldTask,type Alert,type DatabaseField,type FieldTask} from '../../lib/api';
import {usePreferences} from '../../lib/preferencesContext';
import './notification-center.css';

type Notice={key:string;fieldId:string;fieldName:string;id:string;kind:'alert'|'task';title:string;when:string;status:string;unread:boolean};
type Loaded={alerts:Alert[];tasks:FieldTask[]};
export function NotificationCenter({fields}:{fields:DatabaseField[]}){
 const {t,date}=usePreferences();
 const [data,setData]=useState<Record<string,Loaded>>({});
 const [busy,setBusy]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [view,setView]=useState<'unread'|'all'>('unread');
 const [refresh,setRefresh]=useState(0);
 const [expanded,setExpanded]=useState(false);
 const ids=useMemo(()=>fields.filter(field=>!field.isDemo&&field.provenance!=='public_boundary').map(field=>({id:field.id,name:field.name})),[fields]);
 useEffect(()=>{
  if(!expanded)return;
  let mounted=true;setLoading(true);setError('');
  void Promise.all(ids.map(async field=>{
   const [alerts,tasks]=await Promise.allSettled([loadFieldAlerts(field.id),loadFieldTasks(field.id)]);
   return {id:field.id,alerts:alerts.status==='fulfilled'?alerts.value:[],tasks:tasks.status==='fulfilled'?tasks.value:[],failed:alerts.status==='rejected'||tasks.status==='rejected'};
  })).then(results=>{
   if(!mounted)return;
   setData(Object.fromEntries(results.map(item=>[item.id,{alerts:item.alerts,tasks:item.tasks}])));
   if(results.some(item=>item.failed))setError(t('Some notifications could not be loaded.','कुछ सूचनाएँ नहीं मिल सकीं।'));
  }).catch(()=>{if(mounted)setError(t('Unable to load notifications.','सूचनाएँ नहीं मिल सकीं।'));}).finally(()=>{if(mounted)setLoading(false);});
  return ()=>{mounted=false;};
 },[ids,refresh,t,expanded]);
 const notices:Notice[]=ids.flatMap(field=>{
  const value=data[field.id];
  if(!value)return [];
  return [
   ...value.alerts.filter(alert=>alert.action_status!=='superseded').map(alert=>({
    key:'alert:'+alert.id,fieldId:field.id,fieldName:field.name,id:alert.id,kind:'alert' as const,
    title:alert.title,when:alert.observed_at,status:alert.action_status,
    unread:alert.action_status==='open'&&!alert.resolved
   })),
   ...value.tasks.map(task=>({
    key:'task:'+task.id,fieldId:field.id,fieldName:field.name,id:task.id,kind:'task' as const,
    title:task.title,when:task.due_on||'',status:task.status,unread:task.status==='open'
   }))
  ];
 }).sort((a,b)=>b.when.localeCompare(a.when)).slice(0,60);
 const unread=notices.filter(item=>item.unread).length;
 const shown=view==='unread'?notices.filter(item=>item.unread):notices;
 const mark=useCallback(async(item:Notice)=>{
  setBusy(item.key);setError('');
  try{
   if(item.kind==='alert')await updateFieldAlert(item.fieldId,item.id,'acknowledged');
   else await updateFieldTask(item.fieldId,item.id,'acknowledged');
   setData(current=>{
    const entry=current[item.fieldId];if(!entry)return current;
    return {...current,[item.fieldId]:item.kind==='alert'
     ?{...entry,alerts:entry.alerts.map(alert=>alert.id===item.id?{...alert,action_status:'acknowledged'}:alert)}
     :{...entry,tasks:entry.tasks.map(task=>task.id===item.id?{...task,status:'acknowledged'}:task)}};
   });
  }catch{setError(t('Could not mark the notification as seen. Retry.','सूचना देखी हुई दर्ज नहीं हुई। दोबारा कोशिश करें।'));}
  finally{setBusy('');}
 },[t]);
 return <section className="addon-card notification-center" aria-label={t('Notification center','सूचना केंद्र')}>
  <div className="notification-header"><div><h3><Bell size={19}/>{t('Notification center','सूचना केंद्र')}</h3><p>{expanded?t(`${unread} unread field notices and tasks`,`${unread} बिना देखी खेतों की सूचनाएँ और काम`):t('Review alerts and planned visits when needed.','ज़रूरत पड़ने पर अलर्ट और तय जाँच देखें।')}</p></div><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?t('Hide notices','सूचनाएँ छिपाएँ'):t('Show notifications','सूचनाएँ देखें')}</button>{expanded&&<button type="button" aria-label={t('Refresh notifications','सूचनाएँ फिर से लाएँ')} onClick={()=>setRefresh(value=>value+1)} disabled={loading}><RefreshCw size={18}/></button>}</div>
  {expanded&&<><div className="notification-tabs" role="group" aria-label={t('Notification filter','सूचना फ़िल्टर')}><button type="button" aria-pressed={view==='unread'} onClick={()=>setView('unread')}>{t('Unread','बिना देखी')} ({unread})</button><button type="button" aria-pressed={view==='all'} onClick={()=>setView('all')}>{t('All notices','सभी सूचनाएँ')} ({notices.length})</button></div>
  {error&&<p role="alert" className="notification-error">{error}</p>}
  {loading?<p role="status">{t('Loading notifications…','सूचनाएँ ला रहे हैं…')}</p>:shown.length?
   <ul className="notification-list">{shown.slice(0,8).map(item=><li key={item.key}>
    <div><strong>{item.title}</strong><span>{item.fieldName} · {item.when?date(item.when):t('No date','तारीख़ नहीं')} · {item.kind==='task'?t('Visit task','जाँच का काम'):t('Satellite notice','सैटेलाइट सूचना')}</span></div>
    <div className="notification-actions"><Link to={item.kind==='task'?'/fields/'+item.fieldId+'/overview?action=visit':'/fields/'+item.fieldId+'/map'}>{t('Open field','खेत खोलें')}</Link>{item.unread&&<button type="button" disabled={Boolean(busy)} onClick={()=>void mark(item)}><Check size={15}/>{busy===item.key?t('Saving…','सेव हो रहा…'):t('Mark seen','देख लिया')}</button>}</div>
   </li>)}</ul>
   :<p>{view==='unread'?t('No unread notifications.','कोई बिना देखी सूचना नहीं है।'):t('No field notifications yet.','अभी खेतों की कोई सूचना नहीं है।')}</p>}
  <small>{t('Seen status is saved in the existing field tasks and alerts. Background push is not enabled.','देखी हुई स्थिति मौजूदा खेत-कार्य और अलर्ट रिकॉर्ड में सेव होती है। बैकग्राउंड पुश चालू नहीं है।')}</small></>}
 </section>;
}
