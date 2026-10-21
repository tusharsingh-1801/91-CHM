import {PwaStatus} from './features/pwa/PwaStatus';
import './features/platform.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link } from 'react-router-dom';
import { House, MapPinned, FileText, CircleHelp } from 'lucide-react';
import { AuthGate } from './features/auth/AuthGate';
import { CropAssistant } from './features/assistant/CropAssistant';
import { PreferencesProvider } from './lib/preferences';
import { usePreferences } from './lib/preferencesContext';

const Profile = lazy(() => import('./pages/profile/Profile').then(module => ({default:module.Profile})));
const CropGallery = lazy(() => import('./pages/gallery/CropGallery').then(module => ({ default: module.CropGallery })));
const Datasets = lazy(() => import('./pages/datasets/Datasets').then(module => ({ default: module.Datasets })));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard').then(module => ({ default: module.Dashboard })));
const FieldLayout = lazy(() => import('./pages/fields/FieldLayout').then(module => ({ default: module.FieldLayout })));
const FieldMap = lazy(() => import('./pages/fields/FieldMap').then(module => ({ default: module.FieldMap })));
const FieldAnalysis = lazy(() => import('./pages/fields/FieldAnalysis').then(module => ({ default: module.FieldAnalysis })));
const FieldHistory = lazy(() => import('./pages/fields/FieldHistory').then(module => ({ default: module.FieldHistory })));
const FieldOverview = lazy(() => import('./pages/fields/FieldOverview').then(module => ({ default: module.FieldOverview })));
const FieldReport = lazy(() => import('./pages/fields/FieldReport').then(module => ({ default: module.FieldReport })));
const Reports = lazy(() => import('./pages/fields/FieldReport').then(module => ({ default: module.Reports })));
const Help = lazy(() => import('./pages/help/Help').then(module => ({ default: module.Help })));
const ResearchReview = lazy(() => import('./pages/ResearchReview').then(module => ({default:module.ResearchReview})));

function LoadingWorkspace() {
  const {t}=usePreferences();
  return <div className="dashboard-shell" role="status">{t('Loading TerraScope…','TerraScope खोल रहे हैं…')}</div>;
}

function FarmerMobileNavigation() {
  const { t } = usePreferences();
  return <nav className="farmer-mobile-nav" aria-label={t('Main mobile navigation', 'मोबाइल मुख्य नेविगेशन')}>
    <NavLink to="/" end><House aria-hidden="true" size={21}/><span>{t('Home', 'होम')}</span></NavLink>
    <Link to="/#my-fields" onClick={() => { if (window.location.pathname === '/') document.getElementById('my-fields')?.scrollIntoView({ behavior: 'smooth' }); }}><MapPinned aria-hidden="true" size={21}/><span>{t('Fields', 'खेत')}</span></Link>
    <NavLink to="/reports"><FileText aria-hidden="true" size={21}/><span>{t('Reports', 'रिपोर्ट')}</span></NavLink>
    <NavLink to="/help"><CircleHelp aria-hidden="true" size={21}/><span>{t('Help', 'मदद')}</span></NavLink>
  </nav>;
}

export default function App() {
  return (
    <BrowserRouter>
      <PreferencesProvider>
      <PwaStatus/>
      <AuthGate>
        <Suspense fallback={<LoadingWorkspace/>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={<Profile/>} />
            <Route path="/datasets" element={<Datasets />} />
            <Route path="/gallery" element={<CropGallery />} />
            <Route path="/help" element={<Help />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/research/review" element={<ResearchReview/>} />
            <Route path="/fields/:fieldId" element={<FieldLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<FieldOverview />} />
              <Route path="map" element={<FieldMap />} />
              <Route path="analysis" element={<FieldAnalysis />} />
              <Route path="history" element={<FieldHistory />} />
              <Route path="report" element={<FieldReport />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <FarmerMobileNavigation />
        <CropAssistant />
      </AuthGate>
      </PreferencesProvider>
    </BrowserRouter>
  );
}
