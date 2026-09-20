import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/dashboard/Dashboard';
import { FieldLayout } from './pages/fields/FieldLayout';
import { FieldMap } from './pages/fields/FieldMap';
import { FieldAnalysis } from './pages/fields/FieldAnalysis';
import { FieldHistory } from './pages/fields/FieldHistory';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/fields/:fieldId" element={<FieldLayout />}>
          <Route index element={<Navigate to="map" replace />} />
          <Route path="map" element={<FieldMap />} />
          <Route path="analysis" element={<FieldAnalysis />} />
          <Route path="history" element={<FieldHistory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
