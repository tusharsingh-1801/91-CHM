import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { usePreferences } from '../../lib/preferencesContext';
import {UserRound} from 'lucide-react';
import {Link} from 'react-router-dom';
import {AccountSettingsContext} from './AccountSettingsContext';
import {emptyProfile,validateProfile,type ProfileValues} from '../../../../shared/profile';
import {PreferencesBar} from '../../lib/preferences';
import {Notifications} from '../notifications/Notifications';
import { FarmerAccountContext } from './FarmerAccountContext';

type Account = { id: string; email: string; profile?:ProfileValues };
type AuthSession = { mode: 'required' | 'local'; user: Account | null };

async function readSession(): Promise<AuthSession> {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Sign-in service is unavailable. Retry when the API is reachable.');
  const payload = await response.json() as Partial<AuthSession>;
  if ((payload.mode !== 'required' && payload.mode !== 'local') || (payload.user !== null && typeof payload.user !== 'object')) {
    throw new Error('The sign-in service returned an invalid session.');
  }
  return payload as AuthSession;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const {t}=usePreferences();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const localKey='terrascope:profile:'+(document.documentElement.dataset.showcase==='true'?'demo':'local');
  const [localProfile,setLocalProfile]=useState<ProfileValues>(()=>{try{return validateProfile(JSON.parse(sessionStorage.getItem(localKey)||'{}'));}catch{return {...emptyProfile};}});
  const profile=session?.user?{...emptyProfile,...session.user.profile}:localProfile;
  async function saveProfile(value:ProfileValues){
    const validated=validateProfile(value);
    if(!session?.user){sessionStorage.setItem(localKey,JSON.stringify(validated));setLocalProfile(validated);return;}
    const response=await fetch('/api/auth/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(validated)});
    const payload=await response.json() as {user?:Account;error?:string};
    if(!response.ok||!payload.user)throw new Error(payload.error||'Could not save profile');
    setSession(current=>current?{...current,user:payload.user!}:current);
  }
  async function changePassword(currentPassword:string,newPassword:string){
    const response=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword,newPassword})});
    const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||'Could not change password');
  }

  useEffect(() => {
    let active = true;
    void readSession().then(value => {
      if (active) setSession(value);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to check sign-in status.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${registering ? 'register' : 'login'}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password,...(registering?{name:String(form.get('name')??'')}: {}) }),
      });
      const payload = await response.json() as { user?: Account; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Unable to sign in.');
      if (!payload.user?.id || !payload.user.email) throw new Error('The sign-in service returned an invalid account.');
      setSession({ mode: 'required', user: payload.user });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in. Retry shortly.');
    } finally {
      setBusy(false);
    }
  }

  async function openTusharDemo(){
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/auth/demo/tushar',{method:'POST',credentials:'same-origin'});
      const payload=await response.json() as {user?:Account;error?:string};
      if(!response.ok||!payload.user)throw new Error(payload.error||'Demo account unavailable');
      setSession({mode:'required',user:payload.user});
      window.location.assign('/');
    }catch(reason){setError(reason instanceof Error?reason.message:'Demo unavailable');}
    finally{setBusy(false);}
  }
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Sign-out failed. Retry.');
      if(session?.user)for(const key of Object.keys(sessionStorage))if(key.startsWith('terrascope:draft:'+session.user.id+':'))sessionStorage.removeItem(key);
      setSession({ mode: 'required', user: null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-out failed.');
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <><PreferencesBar/><main className="auth-shell" role="status">{t('Checking sign-in status…','साइन इन की स्थिति जाँच रहे हैं…')}</main></>;
  if (error && !session) return <><PreferencesBar/><main className="auth-shell" role="alert"><p>{t('Sign-in service is unavailable. Please retry.', 'साइन इन सेवा उपलब्ध नहीं है। फिर कोशिश करें।')}</p><button onClick={() => window.location.reload()}>{t('Retry','फिर कोशिश करें')}</button></main></>;
  if (!session) return <><PreferencesBar/><main className="auth-shell" role="alert"><p>Sign-in status is unavailable.</p></main></>;
  if (session.mode === 'required' && !session.user) {
    return (
      <><PreferencesBar/><main className="auth-shell">
        <form className="auth-card" onSubmit={submit}>
          <p className="eyebrow">{t('TerraScope • Crop health monitoring','TerraScope • फ़सल की निगरानी')}</p>
          <h1>{registering ? t('Create your account','अपना खाता बनाएँ') : t('Sign in to your fields','अपने खेत देखने के लिए साइन इन करें')}</h1>
          <p>{t('Your field records belong to your account. Old unclaimed fields must be assigned explicitly by the local administrator.', 'आपके खेत की जानकारी आपके खाते में रहती है। पुराने बिना खाते वाले खेत स्थानीय व्यवस्थापक को अलग से जोड़ने होंगे।')}</p>
          {registering&&<><label htmlFor="auth-name">{t('Your name (optional)','आपका नाम (वैकल्पिक)')}</label><input id="auth-name" name="name" autoComplete="name" maxLength={60}/></>}
          <label htmlFor="auth-email">{t('Email','ईमेल')}</label>
          <input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={160} />
          <label htmlFor="auth-password">{t('Password','पासवर्ड')}</label>
          <small>{t('Use at least 12 characters.', 'कम-से-कम 12 अक्षर रखें।')}</small>
          <input id="auth-password" name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={12} maxLength={256} />
          {error && <p className="auth-error" role="alert">{t(error, 'साइन इन नहीं हुआ। ईमेल और कम-से-कम 12 अक्षर वाला पासवर्ड जाँचें। बहुत कोशिश की हो तो 15 मिनट बाद फिर करें।')}</p>}
          <button type="submit" disabled={busy}>{busy ? t('Please wait…','कृपया रुकें…') : registering ? t('Create account','खाता बनाएँ') : t('Sign in','साइन इन करें')}</button>
          {!registering&&<button type="button" disabled={busy} onClick={openTusharDemo}>{t('Open Tushar demo farmer','Tushar का डेमो खेत खोलें')}</button>}
          <button type="button" className="auth-switch" disabled={busy} onClick={() => { setRegistering(!registering); setError(''); }}>
            {registering ? t('Already have an account? Sign in','पहले से खाता है? साइन इन करें') : t('New to TerraScope? Create an account','पहली बार आए हैं? खाता बनाएँ')}
          </button>
        </form>
      </main></>
    );
  }

  const farmerAccount = {id:session.user?.id||'local',email:session.user?.email||'',displayName:profile.name||t('Farmer','किसान')};
  return (
    <AccountSettingsContext.Provider value={{email:session.user?.email||'',signedIn:Boolean(session.user),profile,saveProfile,changePassword,signOut}}>
    <FarmerAccountContext.Provider value={farmerAccount}>
      <PreferencesBar>
        <Notifications key={session.user?.id||'local'} accountId={session.user?.id||(document.documentElement.dataset.showcase==='true'?'demo':'local')}/>
        <Link to="/profile" aria-label={t('Your account','आपका खाता')} className="header-profile-button header-profile-link"><span className="header-avatar"><UserRound size={20} aria-hidden="true"/></span><span className="header-profile-copy"><small>{session.user?t('Signed in','साइन इन है'):t('Your profile','आपकी प्रोफ़ाइल')}</small><strong>{farmerAccount.displayName}</strong></span></Link>
      </PreferencesBar>
      {children}
    </FarmerAccountContext.Provider>
    </AccountSettingsContext.Provider>
  );
}
