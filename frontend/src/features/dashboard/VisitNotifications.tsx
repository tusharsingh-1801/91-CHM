import {useEffect,useState} from 'react';
import {Bell, BellOff} from 'lucide-react';
import {loadFieldTasks,type DatabaseField,type FieldTask} from '../../lib/api';
import {usePreferences} from '../../lib/preferencesContext';
export function VisitNotifications({fields}:{fields:DatabaseField[]}){
 const {t}=usePreferences();
 const [permission,setPermission]=useState<NotificationPermission|'unsupported'>(()=>typeof Notification==='undefined'?'unsupported':Notification.permission);
 const [due,setDue]=useState<Array<{field:string;task:FieldTask}>>([]);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  void Promise.allSettled(fields.map(f=>loadFieldTasks(f.id))).then(results=>{
   if(cancelled)return;
   const today=new Date().toLocaleDateString('en-CA');
   const list=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.filter(task=>task.status!=='resolved'&&task.due_on&&task.due_on<=today).map(task=>({field:fields[i].name,task})):[]);
   setDue(list);
  });return ()=>{cancelled=true;};
 },[fields]);
 async function notify(){
  if(typeof Notification==='undefined')return;
  setBusy(true);
  try{
   const result=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
   setPermission(result);
   if(result==='granted'){
    const details=due.slice(0,3).map(item=>item.field+': '+item.task.title).join('\n');
    new Notification(t('TerraScope field visits','TerraScope खेत की जाँच'),{body:details||t('No overdue field visits recorded.','अभी कोई बकाया जाँच नहीं।')});
   }
  }finally{setBusy(false);}
 }
 return <section className="advanced-notifications" aria-label={t('Field visit notifications','खेत की जाँच की सूचनाएँ')}>
  <h3><Bell size={19}/>{t('Visit reminders','खेत की जाँच की याद दिलाएँ')}</h3>
  <p>{due.length?t(`${due.length} visits need your attention.`,`${due.length} जाँच बाकी हैं।`):t('No overdue visits in your saved tasks.','कोई पुरानी जाँच बाकी नहीं है।')}</p>
  {permission==='unsupported'?<p><BellOff size={15}/>{t('This browser does not support notifications.','यह ब्राउज़र नोटिफिकेशन नहीं दिखा सकता।')}</p>:
   <button type="button" onClick={()=>void notify()} disabled={busy||permission==='denied'}>{permission==='denied'?t('Notifications blocked in browser','ब्राउज़र में सूचनाएँ बंद हैं'):t('Show visit reminder','जाँच का रिमाइंडर दिखाएँ')}</button>}
  <small>{t('Opt-in browser notification, shown when you press the button. Background push delivery is not enabled.','बटन दबाने पर आपकी अनुमति से ब्राउज़र सूचना आएगी। बैकग्राउंड पुश अभी उपलब्ध नहीं है।')}</small>
 </section>;
}
