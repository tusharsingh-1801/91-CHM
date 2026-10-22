import { Link } from 'react-router-dom';
import { Bot, CalendarCheck, Camera, CloudSun, FileText, MapPinned, Satellite, Sprout, ArrowRight } from 'lucide-react';
import type { DatabaseField } from '../../lib/api';
import { fieldAssessment, fieldActionHref, fieldCopy } from '../../lib/fieldCopy';
import { usePreferences } from '../../lib/preferencesContext';
import { useFarmerAccount } from '../auth/FarmerAccountContext';
import './FarmerWelcome.css';

export function FarmerWelcome({fields}:{fields:DatabaseField[]}) {
  const {t,language}=usePreferences();
  const account=useFarmerAccount();
  const real=fields.filter(field=>!field.isDemo&&field.provenance!=='demo'&&field.provenance!=='public_boundary');
  const inspect=real.filter(field=>fieldAssessment(field).state==='needs_inspection');
  const waiting=real.filter(field=>['image_too_old','not_enough_data','awaiting_analysis'].includes(fieldAssessment(field).state));
  const due=real.filter(field=>Number(field.dueTasks)>0);
  const urgent=[...new Map([...inspect,...due,...waiting].map(field=>[field.id,field])).values()];
  const label=account?.displayName || t('Farmer','किसान');
  const totalArea=real.reduce((sum,field)=>sum+(Number.isFinite(Number(field.area_hectares))?Number(field.area_hectares):0),0);
  const actions=[
    {label:t('My fields','मेरे खेत'),href:'#my-fields',Icon:Sprout},
    {label:t('Satellite images','सैटेलाइट तस्वीरें'),href:real[0]?`/fields/${real[0].id}/map`:'#my-fields',Icon:Satellite},
    {label:t('Weather history','पिछला मौसम'),href:'#farm-addons',Icon:CloudSun},
    {label:t('Crop changes','फ़सल के बदलाव'),href:real[0]?`/fields/${real[0].id}/analysis`:'#my-fields',Icon:MapPinned},
    {label:t('Visits & tasks','जाँच और काम'),href:due[0]?`/fields/${due[0].id}/overview#planned-tasks`:'#my-fields',Icon:CalendarCheck},
    {label:t('Reports','रिपोर्ट'),href:'/reports',Icon:FileText},
  ];
  const ask=(question:string)=>window.dispatchEvent(new CustomEvent('terrascope:assistant-question',{detail:{question}}));
  return <section className="farmer-welcome" aria-label={t('Personalized farm home','आपके खेतों का होम')}>
    <div className="farmer-welcome-greeting"><span className="eyebrow">{t('YOUR FARM HOME','आपके खेतों की जानकारी')}</span><h2>{t(`Hello, ${label}!`,`नमस्ते, ${label}!`)}</h2><p>{t('See your fields, decide what to check, and record what you find.','खेतों का हाल देखें, जाँच तय करें और जो मिले उसे दर्ज करें।')}</p></div>
    <div className="farmer-welcome-stats" aria-label={t('Your farm information','आपके खेतों की जानकारी')}>
      <div><strong>{real.length}</strong><span>{t('Saved fields','मेरे खेत')}</span></div>
      <div><strong>{totalArea.toFixed(1)}</strong><span>{t('Hectares recorded','हेक्टेयर क्षेत्र')}</span></div>
      <div><strong>{inspect.length}</strong><span>{t('Inspection signals','जाँच के संकेत')}</span></div>
      <div><strong>{due.length}</strong><span>{t('Tasks due','बाकी काम')}</span></div>
    </div>
    <div className="farmer-welcome-priority"><h3><CalendarCheck size={20} aria-hidden="true"/>{t('What needs attention?','आज किस पर ध्यान दें?')}</h3>
      {urgent.length?urgent.slice(0,2).map(field=>{const copy=fieldCopy(field,language);return <div key={field.id} className="farmer-welcome-alert"><div><strong>{field.name}</strong><p>{copy.explanation}</p></div><Link to={fieldActionHref(field)}>{copy.actionLabel} <ArrowRight size={15}/></Link></div>;}):<p>{real.length?t('No urgent satellite change or overdue task flagged. Keep inspecting fields regularly.','अभी किसी खेत में ज़रूरी सैटेलाइट बदलाव या बाकी काम का संकेत नहीं है। नियमित जाँच करते रहें।'):t('Add your first field below to start monitoring.','निगरानी शुरू करने के लिए नीचे पहला खेत जोड़ें।')}</p>}
    </div>
    <div className="farmer-welcome-choose"><h3>{t('What would you like to see?','आप क्या देखना चाहते हैं?')}</h3><div className="farmer-welcome-actions">
      {actions.map(({label:action,href,Icon})=>href.startsWith('#')?<a key={action} href={href}><Icon size={22}/>{action}</a>:<Link key={action} to={href}><Icon size={22}/>{action}</Link>)}
    </div></div>
    <div className="farmer-welcome-ai"><div><h3><Bot size={22}/>{t('Need advice? Ask Gemini AI','सलाह चाहिए? Gemini AI से पूछें')}</h3><p>{t('Explain the satellite reading, suggest what to inspect, or help understand weather. Answers depend on available evidence.','सैटेलाइट रीडिंग समझें, खेत में क्या जाँचें पूछें या मौसम समझें। जवाब उपलब्ध जानकारी पर आधारित होगा।')}</p></div>
      <div className="farmer-welcome-ai-actions"><button type="button" onClick={()=>ask(t('What should I inspect in my fields?','मेरे खेतों में क्या जाँच करनी चाहिए?'))}>{t('What should I check?','क्या जाँचूँ?')}</button><button type="button" onClick={()=>ask(t('Explain NDVI changes and what they do not prove.','NDVI में बदलाव और उसकी सीमाएँ समझाएँ।'))}>{t('Explain NDVI','NDVI समझाएँ')}</button></div>
    </div>
    <div className="farmer-welcome-followup"><h3>{t('Follow up on your fields','खेतों में आगे की कार्रवाई')}</h3><p>{t('Continue where you left off: plan inspections, attach photos, and review records.','जहाँ छोड़ा था वहीं से जारी रखें: जाँच तय करें, फ़ोटो जोड़ें और पुराने रिकॉर्ड देखें।')}</p>
      <div className="farmer-welcome-followup-actions"><Link to={`/fields/${(due[0]||urgent[0]||real[0])?.id||''}/overview#planned-tasks`} aria-disabled={!real.length} onClick={e=>{if(!real.length)e.preventDefault()}}><CalendarCheck size={18}/>{t('Visit tasks','जाँच के काम')}</Link><Link to={real[0]?`/fields/${real[0].id}/history?photo=1#scouting-title`:'#my-fields'}><Camera size={18}/>{t('Photo & field diary','फ़ोटो और डायरी')}</Link></div>
    </div>
  </section>;
}
