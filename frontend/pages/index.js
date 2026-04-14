import Head from 'next/head';
import { useState, useEffect } from 'react';

const C = {
  navy: "#0B1929",
  navyLight: "#112236",
  orange: "#F97316",
  white: "#FFFFFF",
  text: "#E8EDF2",
  textMuted: "#7A95B0",
};

export default function Home() {
  const [backendStatus, setBackendStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/health`)
      .then(r => r.json())
      .then(data => {
        setBackendStatus(data);
        setLoading(false);
      })
      .catch(err => {
        setBackendStatus({ error: err.message });
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Head>
        <title>Culbridge - Nigeria-EU Trade Compliance Platform</title>
        <meta name="description" content="Production-ready shipment submission form for Culbridge Trade Compliance Platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: C.navy, padding: '40px', fontFamily: "'Outfit', sans-serif" }}>
        <h1 style={{ color: C.white, fontSize: 32 }}>
          <span style={{ color: C.orange }}>Cul</span>bridge
        </h1>
        
        <div style={{ marginTop: 40, padding: 20, background: C.navyLight, borderRadius: 8, border: '1px solid #1E3A5F' }}>
          <h2 style={{ color: C.white }}>Backend Connection Test</h2>
          
          {loading ? (
            <p style={{ color: C.textMuted }}>Checking backend...</p>
          ) : backendStatus?.error ? (
            <p style={{ color: '#E53E3E' }}>❌ Backend unreachable: {backendStatus.error}</p>
          ) : (
            <p style={{ color: '#1a7a4a' }}>✅ Backend connected: {JSON.stringify(backendStatus)}</p>
          )}
          
          <p style={{ color: C.textMuted, marginTop: 10, fontSize: 12 }}>
            API URL: {process.env.NEXT_PUBLIC_API_URL || 'NOT SET'}
          </p>
        </div>
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
      `}</style>
    </>
  );
}
