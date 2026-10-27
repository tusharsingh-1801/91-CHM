import {useEffect,useState} from 'react';import {usePreferences} from '../../lib/preferencesContext';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function PwaStatus(){
 const {t}=usePreferences();const [online,setOnline]=useState(navigator.onLine);const [install,setInstall]=useState<InstallEvent|null>(null);const [update,setUpdate]=useState<ServiceWorker|null>(null);
 useEffect(()=>{
  const network=()=>setOnline(navigator.onLine);const available=(event:Event)=>{event.preventDefault();setInstall(event as InstallEvent);};
  window.addEventListener('online',network);window.addEventListener('offline',network);window.addEventListener('beforeinstallprompt',available);
  let active=true;
  if(import.meta.env.PROD&&'serviceWorker' in navigator){void navigator.serviceWorker.register('/sw.js').then(registration=>{
   if(!active)return;if(registration.waiting)setUpdate(registration.waiting);
   registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(active&&worker.state==='installed'&&navigator.serviceWorker.controller)setUpdate(worker);});});
  }).catch(()=>{/* Browser operation continues if installation is unavailable. */});}
  return()=>{active=false;window.removeEventListener('online',network);window.removeEventListener('offline',network);window.removeEventListener('beforeinstallprompt',available);};
 },[]);
 return <div className="pwa-status no-print" aria-live="polite">{!online&&<span role="status">{t('Offline · new records and forecasts need a connection. Note drafts stay in this tab.','ऑफ़लाइन · नई जानकारी के लिए इंटरनेट चाहिए। नोट ड्राफ़्ट इसी टैब में रहेंगे।')}</span>}{install&&<button type="button" onClick={async()=>{await install.prompt();await install.userChoice;setInstall(null);}}>{t('Install TerraScope','TerraScope इंस्टॉल करें')}</button>}{update&&<button type="button" onClick={()=>{if(window.confirm(t('Reload to update? Unsaved form edits may be lost.','अपडेट के लिए पेज खोलें? बिना सेव किए बदलाव खो सकते हैं।'))){update.postMessage({type:'ACTIVATE_UPDATE'});navigator.serviceWorker.addEventListener('controllerchange',()=>window.location.reload(),{once:true});}}}>{t('Update available','अपडेट उपलब्ध है')}</button>}</div>;
}
