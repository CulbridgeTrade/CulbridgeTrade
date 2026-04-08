import Head from 'next/head';
import CulbridgeSubmissionForm from '../CulbridgeSubmissionForm';
import CulbridgeAdminDashboard from '../CulbridgeAdminDashboard';
import CulbridgeExporterDashboard from '../CulbridgeExporterDashboard';
import { useState } from 'react';

const C = {
  navy: "#0B1929",
  navyLight: "#112236",
  orange: "#F97316",
  white: "#FFFFFF",
  text: "#E8EDF2",
  textMuted: "#7A95B0",
};

export default function Home() {
  const [currentView, setCurrentView] = useState('submission');

  const views = [
    { id: 'submission', label: 'Submission Form', icon: '📝' },
    { id: 'admin', label: 'Admin Dashboard', icon: '⚙️' },
    { id: 'exporter', label: 'Exporter Dashboard', icon: '📦' },
  ];

  return (
    <>
      <Head>
        <title>Culbridge - Nigeria-EU Trade Compliance Platform</title>
        <meta name="description" content="Production-ready shipment submission form for Culbridge Trade Compliance Platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: C.navy }}>
        {/* Navigation */}
        <nav style={{
          background: C.navyLight,
          borderBottom: '1px solid #1E3A5F',
          padding: '12px 24px',
          display: 'flex',
          gap: '8px',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
        }}>
          <div style={{ fontWeight: 800, fontSize: 20, marginRight: 'auto' }}>
            <span style={{ color: C.white }}>Cul</span><span style={{ color: C.orange }}>bridge</span>
          </div>
          {views.map(view => (
            <button
              key={view.id}
              onClick={() => setCurrentView(view.id)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                background: currentView === view.id ? C.orange : 'transparent',
                color: currentView === view.id ? C.white : C.textMuted,
                cursor: 'pointer',
                fontWeight: 500,
                fontFamily: "'Outfit', sans-serif",
                transition: 'all 0.2s',
              }}
            >
              {view.icon} {view.label}
            </button>
          ))}
        </nav>

        {/* Main Content */}
        <main style={{ padding: '24px' }}>
          {currentView === 'submission' && <CulbridgeSubmissionForm />}
          {currentView === 'admin' && <CulbridgeAdminDashboard />}
          {currentView === 'exporter' && <CulbridgeExporterDashboard />}
        </main>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #0B1929;
        }
      `}</style>
    </>
  );
}
