/**
 * Main App Component
 * Simple preview version - loads components from parent directory
 */

import { useState } from 'react'
import CulbridgeSubmissionForm from '../CulbridgeSubmissionForm.jsx'
import CulbridgeAdminDashboard from '../CulbridgeAdminDashboard.jsx'
import CulbridgeExporterDashboard from '../CulbridgeExporterDashboard.jsx'

const C = {
  navy: "#0B1929",
  navyLight: "#112236",
  orange: "#F97316",
  white: "#FFFFFF",
  text: "#E8EDF2",
  textMuted: "#7A95B0",
}

export default function App() {
  const [currentView, setCurrentView] = useState('submission')
  const [hasError, setHasError] = useState(false)

  const views = [
    { id: 'submission', label: 'Submission Form', icon: '📝' },
    { id: 'admin', label: 'Admin Dashboard', icon: '⚙️' },
    { id: 'exporter', label: 'Exporter Dashboard', icon: '📦' },
  ]

  const handleError = () => {
    setHasError(true)
  }

  return (
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
        {hasError ? (
          <div style={{ 
            textAlign: 'center', 
            padding: 40, 
            color: C.textMuted,
            background: C.navyLight,
            borderRadius: 12,
            border: '1px solid #1E3A5F'
          }}>
            <h2 style={{ color: C.white, marginBottom: 16 }}>Preview Unavailable</h2>
            <p>The React components have syntax that needs fixing for Vite.</p>
            <p style={{ marginTop: 16 }}>Try running the backend server instead:</p>
            <pre style={{ 
              marginTop: 16, 
              padding: 16, 
              background: '#0D1F33', 
              borderRadius: 8,
              textAlign: 'left',
              display: 'inline-block'
            }}>
npm run dev
            </pre>
          </div>
        ) : (
          <>
            {currentView === 'submission' && <CulbridgeSubmissionForm />}
            {currentView === 'admin' && <CulbridgeAdminDashboard />}
            {currentView === 'exporter' && <CulbridgeExporterDashboard />}
          </>
        )}
      </main>

      {/* Error Boundary */}
      <div style={{ display: 'none' }} onError={handleError} />
    </div>
  )
}
