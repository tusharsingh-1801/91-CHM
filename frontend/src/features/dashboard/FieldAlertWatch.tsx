import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {BellRing,BellOff} from 'lucide-react';
import {loadFieldAlerts,loadFieldTasks,type DatabaseField} from '../../lib/api';
import {pendingWatchNotices,unseenWatchNotices} from '../../lib/fieldAlertWatch';
import {usePreferences} from '../../lib/preferencesContext';
import './field-alert-watch.css';

const CHECK_INTERVAL_MS=15*60*1000;
export function FieldAlertWatch({fields}:{fields:DatabaseField[]}){
 const {t}=usePreferences();
 const [permission,setPermission]=useState<NotificationPermission|'unsupported'>(()=>typeof Notification==='undefined'?'unsupported':Notification.permission);
 const [enabled,setEnabled]=useState(false);
 const [checking,setChecking]=useState(false);
 const [message,setMessage]=useState('');
 const seen=useRef(new Set<string>());
 const running=useRef(false);
 const active=useRef(false);
 const fieldList=useMemo(()=>fields,[fields]);
 const check=useCallback(async()=>{
  if(!active.current||running.current||document.visibilityState==='hidden'||!navigator.onLine||Notification.permission!=='granted')return;
  running.current=true;setChecking(true);
  try{
   const results=await Promise.allSettled(fieldList.map(async field=>{
    const [alerts,tasks]=await Promise.allSettled([loadFieldAlerts(field.id),loadFieldTasks(field.id)]);
    if(alerts.status==='rejected'||tasks.status==='rejected')throw new Error('Unable to read all field notices');
    return pendingWatchNotices(field.id,field.name,alerts.value,tasks.value,new Date().toLocaleDateString('en-CA'));
   }));
   if(!active.current)return;
   const failures=results.filter(result=>result.status==='rejected').length;
   const all=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
   const unseen=unseenWatchNotices(all,seen.current);
   if(unseen.length){
    // One notification per successful check; never repeat the same record in this browser session.
    const details=unseen.slice(0,3).map(item=>item.field+': '+item.title).join('\n');
    const title=t('TerraScope field updates','TerraScope खेत की सूचनाएँ');
    const body=details+(unseen.length>3?t(`\n+ ${unseen.length-3} more`,`\n+ ${unseen.length-3} और`):'');
    const notification=new Notification(title,{body,tag:'terrascope-field-watch'});
    notification.onclick=()=>{window.focus();notification.close();};
    unseen.forEach(item=>seen.current.add(item.key));
    setMessage(t(`Notified about ${unseen.length} new field item(s).`,`${unseen.length} नए खेत के कामों की सूचना दी।`));
   }else if(!failures){
    setMessage(t('Checked your fields. No new open alerts or overdue visits.','खेतों की जाँच हुई। कोई नई खुली चेतावनी या बकाया जाँच नहीं।'));
   }
   if(failures)setMessage(t(`Could not check ${failures} field(s). Retry while online.`,`${failures} खेत की जानकारी नहीं मिली। इंटरनेट आने पर फिर कोशिश करें।`));
  }catch{if(active.current)setMessage(t('Notifications could not be shown. Please check browser permissions.','सूचनाएँ नहीं दिखीं। ब्राउज़र की अनुमति जाँचें।'));}
  finally{running.current=false;if(active.current)setChecking(false);}
 },[fieldList,t]);
 useEffect(()=>{
  if(!enabled)return;
  active.current=true;
  void check();
  const interval=window.setInterval(()=>{void check();},CHECK_INTERVAL_MS);
  const onVisible=()=>{if(document.visibilityState==='visible')void check();};
  window.addEventListener('online',onVisible);
  document.addEventListener('visibilitychange',onVisible);
  return ()=>{active.current=false;window.clearInterval(interval);window.removeEventListener('online',onVisible);document.removeEventListener('visibilitychange',onVisible);};
 },[enabled,check]);
 async function toggle(){
  if(enabled){active.current=false;setEnabled(false);setMessage(t('Alert watch paused.','अलर्ट जाँच बंद कर दी गई।'));return;}
  if(typeof Notification==='undefined'){setPermission('unsupported');return;}
  const next=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
  setPermission(next);
  if(next!=='granted'){setMessage(t('Allow notifications in browser settings to use this feature.','इस सुविधा के लिए ब्राउज़र सेटिंग में सूचना की अनुमति दें।'));return;}
  setEnabled(true);setMessage(t('Alert watch enabled for this open browser tab.','इस खुले ब्राउज़र टैब पर अलर्ट जाँच शुरू हुई।'));
 }
 return <section className="field-alert-watch" aria-label={t('Automatic field alert watcher','खेत अलर्ट की स्वतः जाँच')}>
  <h3><BellRing size={19}/>{t('Automatic field alert watch','खेत अलर्ट की स्वतः जाँच')}</h3>
  <p>{t('Opt in to check open satellite alerts and overdue field visits while TerraScope stays open and online. Checks on enable, on return, and approximately every 15 minutes.','TerraScope खुला और ऑनलाइन होने पर खुले सैटेलाइट अलर्ट और बकाया खेत-जाँच देखें। शुरू करते समय, वापस आने पर और लगभग हर 15 मिनट में जाँच होती है।')}</p>
  {permission==='unsupported'?<p><BellOff size={15}/>{t('Browser notifications unavailable.','ब्राउज़र सूचनाएँ उपलब्ध नहीं हैं।')}</p>:<button type="button" onClick={()=>void toggle()} disabled={permission==='denied'&&!enabled} aria-pressed={enabled}>{enabled?t('Pause alert watch','अलर्ट जाँच रोकें'):t('Enable alert watch','अलर्ट जाँच चालू करें')}</button>}
  {enabled&&<button type="button" onClick={()=>void check()} disabled={checking}>{checking?t('Checking…','जाँच रहे हैं…'):t('Check now','अभी जाँचें')}</button>}
  {message&&<p className="field-alert-watch-status" role="status">{message}</p>}
  <small>{t('Notifications are optional and stop when this tab closes. This does not provide background push or SMS. No browser permission is requested until you enable it.','सूचनाएँ वैकल्पिक हैं और टैब बंद होने पर रुक जाती हैं। यह बैकग्राउंड पुश या SMS नहीं है। आपकी अनुमति बिना पूछे नहीं ली जाती।')}</small>
 </section>;
}
