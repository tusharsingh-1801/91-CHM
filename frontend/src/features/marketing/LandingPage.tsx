import { ArrowRight, Check, CloudSun, MapPinned, Satellite, ShieldCheck, Sprout } from 'lucide-react';
import { usePreferences } from '../../lib/preferencesContext';
import './landing-page.css';
import { DataCredits } from '../credits/DataCredits';

export function LandingPage({ onSignIn, onCreateAccount }: { onSignIn: () => void; onCreateAccount: () => void }) {
  const { t } = usePreferences();
  return <div className="landing-site">
    <header className="site-header">
      <a className="site-brand" href="#home"><span><img src="/images/logo.png" alt="" width={34} height={34} className="brand-logo"/></span><span className="brand-word" aria-label="TerraScope">Terra<span className="brand-s" aria-hidden="true">S</span>cope</span></a>
      <nav aria-label={t('Website navigation', 'वेबसाइट नेविगेशन')}>
        <a href="#features">{t('Features', 'सुविधाएँ')}</a>
        <a href="#how-it-works">{t('How it works', 'यह कैसे काम करता है')}</a>
        <a href="#about">{t('About', 'हमारे बारे में')}</a>
      </nav>
      <div className="site-actions"><button className="site-login" onClick={onSignIn}>{t('Sign in', 'साइन इन')}</button><button className="site-cta" onClick={onCreateAccount}>{t('Get started', 'शुरू करें')}<ArrowRight size={16}/></button></div>
    </header>

    <main id="home">
      <section className="site-hero">
        <div className="site-hero-copy">
          <span className="site-eyebrow"><Sprout size={15}/>{t('A clearer view of every field', 'हर खेत की साफ़ तस्वीर')}</span>
          <h1>{t('Grow with confidence.', 'आत्मविश्वास से खेती करें।')}<em>{t('Know your fields.', 'अपने खेतों को समझें।')}</em></h1>
          <p>{t('TerraScope brings satellite insights, field records and local weather together, so you can decide what to check and what to do next.', 'TerraScope सैटेलाइट जानकारी, खेत के रिकॉर्ड और स्थानीय मौसम को एक जगह लाता है, ताकि आप तय कर सकें कि आगे क्या देखना और करना है।')}</p>
          <div className="site-hero-actions"><button className="site-cta site-cta-large" onClick={onCreateAccount}>{t('Explore your farm', 'अपने खेत देखें')}<ArrowRight size={17}/></button><a href="#how-it-works" className="site-text-link">{t('See how it works', 'जानें यह कैसे काम करता है')}<ArrowRight size={15}/></a></div>
          <div className="site-proof"><span><Check size={14}/>{t('Field health at a glance', 'खेत की सेहत एक नज़र में')}</span><span><Check size={14}/>{t('Weather-aware planning', 'मौसम के अनुसार योजना')}</span></div>
        </div>
        <div className="site-hero-visual" aria-label={t('TerraScope field monitoring preview', 'TerraScope खेत निगरानी झलक')}>
          <div className="site-visual-glow"/>
          <div className="site-preview-card">
            <div className="site-preview-top"><span className="site-preview-icon"><MapPinned size={18}/></span><div><b>{t('Your fields, together', 'आपके सभी खेत')}</b><small>{t('Satellite field overview', 'सैटेलाइट खेत दृश्य')}</small></div><span className="site-live-dot"/></div>
            <div className="site-preview-map"><img src="/images/satellite.png" alt={t('Satellite view of agricultural fields', 'खेती के खेतों का सैटेलाइट दृश्य')}/><span className="site-map-pin pin-one"><Sprout size={15}/></span><span className="site-map-pin pin-two"><Sprout size={15}/></span><span className="site-map-pin pin-three"><Sprout size={15}/></span><div className="site-map-label"><i/> {t('Healthy', 'स्वस्थ')} <i/> {t('Needs a look', 'जाँचें')}</div></div>
            <div className="site-preview-bottom"><span><small>{t('Fields monitored', 'निगरानी वाले खेत')}</small><b>6</b></span><span><small>{t('Area recorded', 'दर्ज क्षेत्रफल')}</small><b>8,824 <small>ha</small></b></span><span><small>{t('Field signals', 'खेत के संकेत')}</small><b>2</b></span></div>
          </div>
          <div className="site-weather-float"><span><CloudSun size={19}/></span><div><b>{t('Weather for your farm', 'आपके खेत का मौसम')}</b><small>{t('Plan around local conditions', 'स्थानीय मौसम के अनुसार योजना')}</small></div><ArrowRight size={16}/></div>
          <div className="site-satellite-float"><Satellite size={17}/>{t('Satellite insights', 'सैटेलाइट जानकारी')}</div>
        </div>
        <div className="site-hero-photo" aria-hidden="true"/>
      </section>

      <section className="site-trust" id="about"><div><b>Field-first</b><span>{t('Tools made around the way farms are managed', 'खेती के रोज़मर्रा के कामों के लिए बने औज़ार')}</span></div><i/><div><b>Clear signals</b><span>{t('Understand what may need a closer look', 'जानें किस चीज़ पर ध्यान देना है')}</span></div><i/><div><b>One workspace</b><span>{t('Keep maps, notes and forecasts together', 'नक्शे, नोट्स और मौसम एक जगह')}</span></div></section>

      <section className="site-features" id="features">
        <div className="site-section-heading"><span>{t('Made for the whole season', 'पूरे मौसम के लिए')}</span><h2>{t('Everything you need to understand your fields', 'अपने खेतों को समझने के लिए ज़रूरी सब कुछ')}</h2><p>{t('A practical view of what is happening on the ground and what the latest field data can tell you.', 'खेत में क्या हो रहा है और नया डेटा क्या बता रहा है—एक उपयोगी नज़र।')}</p></div>
        <div className="site-feature-grid">
          <article><span className="feature-icon icon-green"><MapPinned size={21}/></span><h3>{t('All your fields on one map', 'एक नक्शे पर आपके सभी खेत')}</h3><p>{t('See saved boundaries and open a field to review its latest information.', 'खेत की सीमाएँ देखें और नई जानकारी के लिए खेत खोलें।')}</p><a href="#how-it-works">{t('Explore field maps', 'खेत के नक्शे देखें')}<ArrowRight size={14}/></a></article>
          <article><span className="feature-icon icon-blue"><Satellite size={21}/></span><h3>{t('Satellite crop insights', 'सैटेलाइट से फसल की जानकारी')}</h3><p>{t('Follow vegetation changes over time and find areas that may deserve a closer look.', 'समय के साथ हरियाली में बदलाव देखें और जाँचने योग्य जगह पहचानें।')}</p><a href="#how-it-works">{t('Understand field signals', 'खेत के संकेत समझें')}<ArrowRight size={14}/></a></article>
          <article><span className="feature-icon icon-amber"><CloudSun size={21}/></span><h3>{t('Weather for your fields', 'आपके खेतों का मौसम')}</h3><p>{t('Use local forecasts to plan inspections and keep field notes in context.', 'स्थानीय मौसम के आधार पर खेत की जाँच और नोट्स की योजना बनाएँ।')}</p><a href="#how-it-works">{t('Plan with the forecast', 'मौसम देखकर योजना बनाएँ')}<ArrowRight size={14}/></a></article>
          <article><span className="feature-icon icon-purple"><ShieldCheck size={21}/></span><h3>{t('Your records stay organized', 'आपके रिकॉर्ड व्यवस्थित रहें')}</h3><p>{t('Keep observations, tasks and reports together for each field and season.', 'हर खेत और मौसम के निरीक्षण, काम और रिपोर्ट एक जगह रखें।')}</p><a href="#how-it-works">{t('Keep a field history', 'खेत का इतिहास रखें')}<ArrowRight size={14}/></a></article>
        </div>
      </section>

      <section className="site-how" id="how-it-works"><div><span>{t('A simple place to start', 'आसान शुरुआत')}</span><h2>{t('From field boundary to next step.', 'खेत की सीमा से अगले कदम तक।')}</h2><p>{t('Add your fields, review the map and recent signals, then record what you find on the ground.', 'अपने खेत जोड़ें, नक्शे और नए संकेत देखें, फिर खेत में मिली जानकारी दर्ज करें।')}</p><button className="site-cta" onClick={onCreateAccount}>{t('Start with your fields', 'अपने खेतों से शुरू करें')}<ArrowRight size={16}/></button></div><div className="site-steps"><div><b>01</b><span><strong>{t('Add a field', 'खेत जोड़ें')}</strong><small>{t('Save a field boundary and crop details.', 'खेत की सीमा और फसल की जानकारी सहेजें।')}</small></span></div><div><b>02</b><span><strong>{t('Review the signals', 'संकेत देखें')}</strong><small>{t('Check satellite changes and weather.', 'सैटेलाइट बदलाव और मौसम देखें।')}</small></span></div><div><b>03</b><span><strong>{t('Plan your visit', 'खेत की जाँच करें')}</strong><small>{t('Record observations and next steps.', 'निरीक्षण और अगले कदम दर्ज करें।')}</small></span></div></div></section>
    </main>
    <footer className="site-footer"><a className="site-brand" href="#home"><span><img src="/images/logo.png" alt="" width={28} height={28} className="brand-logo"/></span><span className="brand-word" aria-label="TerraScope">Terra<span className="brand-s" aria-hidden="true">S</span>cope</span></a><small>© {new Date().getFullYear()} TerraScope · {t('Clearer decisions for every field.', 'हर खेत के लिए बेहतर फैसले।')}</small><button onClick={onSignIn}>{t('Sign in', 'साइन इन')}<ArrowRight size={14}/></button></footer>
    <DataCredits className="site-credits"/>
  </div>;
}
