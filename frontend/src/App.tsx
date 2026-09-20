import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const Dashboard = lazy(() => import('./pages/dashboard/Dashboard').then(module => ({ default: module.Dashboard })));
const FieldLayout = lazy(() => import('./pages/fields/FieldLayout').then(module => ({ default: module.FieldLayout })));
const FieldMap = lazy(() => import('./pages/fields/FieldMap').then(module => ({ default: module.FieldMap })));
const FieldAnalysis = lazy(() => import('./pages/fields/FieldAnalysis').then(module => ({ default: module.FieldAnalysis })));
const FieldHistory = lazy(() => import('./pages/fields/FieldHistory').then(module => ({ default: module.FieldHistory })));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Loading TerraScope…</div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/fields/:fieldId" element={<FieldLayout />}>
            <Route index element={<Navigate to="map" replace />} />
            <Route path="map" element={<FieldMap />} />
            <Route path="analysis" element={<FieldAnalysis />} />
            <Route path="history" element={<FieldHistory />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
