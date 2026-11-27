import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Moon, Sun, House, FileText, CircleHelp, Globe2, Menu, X, Sparkles, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import '../features/dashboard/farm-home.css';
import '../features/letter-colors.css';
import { PreferencesContext, usePreferenceState, usePreferences, type Language, type AreaUnit } from './preferencesContext';

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const value = usePreferenceState();
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
export function PreferencesBar({children}:{children?:ReactNode}) {
  const { t, language, unit, setLanguage, setUnit } = usePreferences();
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('terrascope.theme') === 'dark'; } catch { return false; } });
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { document.documentElement.dataset.tsTheme = dark ? 'dark' : 'light'; try { localStorage.setItem('terrascope.theme', dark ? 'dark' : 'light'); } catch { /* theme still applies this session */ } }, [dark]);
  useEffect(() => { if (!menuOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [menuOpen]);
  return <>
    {menuOpen && <button className="dashboard-sidebar-backdrop" aria-label={t('Close navigation menu', 'नेविगेशन बंद करें')} onClick={() => setMenuOpen(false)} />}
    <header className="preferences-bar no-print" data-menu-open={menuOpen}>
    <NavLink to="/" className="brand" onClick={() => setMenuOpen(false)}><img src="/images/logo.png" alt="" width={40} height={40} className="brand-logo"/><b aria-label="TerraScope">Terra<span className="brand-s" aria-hidden="true">S</span>cope</b><small>{t('Grow Smarter', 'बेहतर खेती')}</small></NavLink>
    {children && <button type="button" className="dashboard-menu-toggle" aria-label={menuOpen ? t('Close navigation menu', 'नेविगेशन बंद करें') : t('Open navigation menu', 'नेविगेशन खोलें')} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={20}/> : <Menu size={20}/>}</button>}
    <nav className="top-nav" aria-label={t('Main navigation', 'मुख्य नेविगेशन')}>
      <NavLink to="/" end onClick={() => setMenuOpen(false)}><House aria-hidden="true" size={18}/><span>{t('Dashboard', 'डैशबोर्ड')}</span></NavLink>
      <NavLink to="/reports" onClick={() => setMenuOpen(false)}><FileText aria-hidden="true" size={18}/><span>{t('Reports', 'रिपोर्ट')}</span></NavLink>
      <NavLink to="/help" onClick={() => setMenuOpen(false)}><CircleHelp aria-hidden="true" size={18}/><span>{t('Help', 'मदद')}</span></NavLink>
    </nav>
    <section className="sidebar-promo">
      <span><Sparkles size={13}/> GEMINI AGRI-INSIGHTS</span>
      <strong>{t('Healthy fields.', 'स्वस्थ खेत।')}</strong>
      <p>{t('A greener tomorrow starts with a closer look.', 'बेहतर कल के लिए खेत को समझें।')}</p>
      <button onClick={() => { setMenuOpen(false); document.getElementById('fh-gemini-question')?.focus(); }}><span>{t('Explore AI', 'AI से पूछें')}</span><ArrowRight size={14}/></button>
    </section>
    <div className="preference-controls">
      <label className="language-control"><Globe2 aria-hidden="true" size={17}/><span className="sr-only-sm">{t('Language', 'भाषा')}</span><select aria-label="Language / भाषा" value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="hi">हिंदी</option></select></label>
      <label>{t('Area unit', 'क्षेत्रफल की इकाई')}<select aria-label={t('Area unit', 'क्षेत्रफल की इकाई')} value={unit} onChange={event => setUnit(event.target.value as AreaUnit)}><option value="ha">{t('Hectares', 'हेक्टेयर')}</option><option value="acre">{t('Acres', 'एकड़')}</option><option value="m2">{t('Square metres', 'वर्ग मीटर')}</option></select></label>
    </div>
    {children && <div className="header-account-actions"><button type="button" className="theme-toggle" onClick={() => setDark(value => !value)} aria-label={dark ? t('Switch to light mode', 'लाइट मोड') : t('Switch to dark mode', 'डार्क मोड')} title={t('Toggle dark / light mode', 'डार्क / लाइट मोड')}>{dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}</button>{children}</div>}
    </header>
  </>;
}
