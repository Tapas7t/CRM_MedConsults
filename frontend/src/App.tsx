import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { env } from './lib/env';

function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center mx-auto mb-4 font-bold text-xl">
          MC
        </div>
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">MedConsults CRM</h1>
        <p className="text-sm text-slate-600 mb-6">
          Single-Clinic CRM &amp; OPD Booking Platform
        </p>
        <div className="p-3 bg-slate-100 rounded-lg text-xs text-slate-500 font-mono">
          API Base URL: {env.VITE_API_BASE_URL}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
