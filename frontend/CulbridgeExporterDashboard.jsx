/**
 * CulbridgeExporterDashboard.jsx
 * Production-ready React component.
 * Connects to your backend via env vars.
 * No mocks. Real API calls.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import api from "./lib/api";

const getToken = () => localStorage.getItem("culbridge_access_token") || "";
const getShipments = async (filters) => {
  const params = new URLSearchParams(filters).toString();
  return api.get(`/api/v1/shipments?${params}`);
};

const withdrawShipment = async (shipmentId, reason) => {
  const res = await fetch(`${API_BASE}/shipments/${shipmentId}/withdraw`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ reason })
  });
  return res.json();
};

const downloadAudit = async (shipmentId) => {
  const res = await fetch(`${API_BASE}/shipments/${shipmentId}/audit-export`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${shipmentId}-audit.pdf`;
  a.click();
};

const ShipmentRow = ({ shipment, onWithdraw, onResubmit }) => (
  <tr className={`shipment-row ${shipment.complianceStatus.toLowerCase()}`}>
    <td>{shipment.shipmentId}</td>
    <td>{shipment.exporter_name || 'Unknown'}</td>
    <td className="highlight">{shipment.commodity}</td>
    <td>{shipment.destination}</td>
    <td>{shipment.nepcVerified ? '✅' : '❌'}</td>
    <td>{shipment.rasffAlertCount || 0}</td>
    <td className="lab-status">{shipment.labResult}</td>
    <td className="compliance-status">
      <span className={`status-badge status-${shipment.complianceStatus.toLowerCase()}`}>
        {shipment.complianceStatus}
      </span>
    </td>
    <td className="actions">
      {shipment.issues?.length > 0 ? (
        <button onClick={() => onResubmit(shipment.shipmentId)} className="btn-resubmit">
          Resubmit
        </button>
      ) : (
        <span className="cleared">✓ Cleared</span>
      )}
      <button onClick={() => onWithdraw(shipment)} className="btn-withdraw">
        Withdraw
      </button>
      <button onClick={() => downloadAudit(shipment.shipmentId)} className="btn-audit">
        Audit PDF
      </button>
    </td>
  </tr>
);

const CulbridgeExporterDashboard = ({ onNewShipment, onResubmit }) => {
  const [shipments, setShipments] = useState([]);
  const [filters, setFilters] = useState({ status: '', commodity: '', destination: '', search: '' });
  const [summary, setSummary] = useState({ cleared: 0, warning: 0, blocked: 0 });
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const loadShipments = useCallback(async () => {
    try {
      const data = await getShipments(filters);
      setShipments(data.shipments || data);
    } catch (e) {
      console.error('Load shipments failed', e);
    }
  }, [filters]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/shipments/summary`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setSummary(await res.json());
    } catch (e) {
      console.error('Load summary failed', e);
    }
  }, []);

  const connectWS = useCallback(() => {
    const token = getToken();
    const wsUrl = `${WS_BASE}/ws/shipments?token=${token}`;
    
    const newWs = new WebSocket(wsUrl);
    newWs.onopen = () => {
      setIsConnected(true);
      setShowReconnect(false);
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pollIntervalRef.current);
    };
    
    newWs.onmessage = (event) => {
      const update = JSON.parse(event.data);
      if (update.type === 'SHIPMENT_UPDATED') {
        setShipments(prev => prev.map(s => s.shipmentId === update.data.shipmentId ? update.data : s));
        loadSummary();
      }
    };
    
    newWs.onclose = () => {
      setIsConnected(false);
      // Start polling fallback
      pollIntervalRef.current = setInterval(loadShipments, POLL_FALLBACK_MS);
      // Show reconnect banner after 2 minutes
      reconnectTimeoutRef.current = setTimeout(() => setShowReconnect(true), 120000);
    };
    
    wsRef.current = newWs;
    setWs(newWs);
  }, [loadShipments, loadSummary]);

  useEffect(() => {
    loadShipments();
    loadSummary();
    connectWS();
    
    return () => {
      if (wsRef.current) wsRef.current.close();
      clearInterval(pollIntervalRef.current);
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [loadShipments, loadSummary, connectWS]);

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    // Trigger reload
    loadShipments();
  }, [loadShipments]);

  const handleWithdraw = useCallback(async (shipment) => {
    const reason = prompt('Reason for withdrawal?', 'incorrect_details');
    if (!reason) return;
    
    try {
      await withdrawShipment(shipment.shipmentId, reason);
      loadShipments(); // Refresh
    } catch (e) {
      alert('Withdrawal failed. Please try again.');
    }
  }, [loadShipments]);

  const ReconnectBanner = () => isConnected ? null : (
    <div className="reconnect-banner">
      {showReconnect ? (
        <div>
          Connection lost. <button onClick={connectWS}>Reconnect</button>
        </div>
      ) : (
        <div>Syncing...</div>
      )}
    </div>
  );

  return (
    <div className="culbridge-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <h1>Culbridge Exporter Dashboard</h1>
        <button onClick={onNewShipment} className="btn-new">
          + New Shipment
        </button>
      </header>

      {/* Summary Bar */}
      <div className="summary-bar">
        <div className="summary-card cleared">
          <div className="number">{summary.cleared}</div>
          <div className="label">Cleared</div>
        </div>
        <div className="summary-card warning">
          <div className="number">{summary.warning}</div>
          <div className="label">Warnings</div>
        </div>
        <div className="summary-card blocked">
          <div className="number">{summary.blocked}</div>
          <div className="label">Blocked</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <select value={filters.status} onChange={(e) => handleFilterChange({...filters, status: e.target.value})}>
          {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={filters.commodity} onChange={(e) => handleFilterChange({...filters, commodity: e.target.value})}>
          {COMMODITY_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={filters.destination} onChange={(e) => handleFilterChange({...filters, destination: e.target.value})}>
          {DESTINATION_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <input 
          placeholder="Search exporter or shipment ID" 
          value={filters.search}
          onChange={(e) => handleFilterChange({...filters, search: e.target.value})}
        />
      </div>

      {/* Reconnect Banner */}
      <ReconnectBanner />

      {/* Shipments Table */}
      <div className="shipments-table">
        <table>
          <thead>
            <tr>
              <th>Shipment ID</th>
              <th>Exporter</th>
              <th>Commodity</th>
              <th>Destination</th>
              <th>NEPC</th>
              <th>RASFF</th>
              <th>Lab</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map(shipment => (
              <ShipmentRow 
                key={shipment.shipmentId} 
                shipment={shipment} 
                onWithdraw={handleWithdraw}
                onResubmit={onResubmit}
              />
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .culbridge-dashboard {
          font-family: 'Outfit', sans-serif;
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
        }
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }
        .btn-new {
          background: #4F46E5;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          border: none;
          cursor: pointer;
        }
        .summary-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .summary-card {
          padding: 20px;
          border-radius: 12px;
          text-align: center;
        }
        .summary-card.cleared { background: #10B981; color: white; }
        .summary-card.warning { background: #F59E0B; color: white; }
        .summary-card.blocked { background: #EF4444; color: white; }
        .summary-card .number { font-size: 2.5rem; font-weight: 800; }
        .filters {
          display: flex;
          gap: 12px;
          margin-bottom: 30px;
          flex-wrap: wrap;
        }
        .filters select, .filters input {
          padding: 8px 12px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 14px;
        }
        .filters input {
          flex: 1;
          min-width: 200px;
        }
        .reconnect-banner {
          background: #FCD34D;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 20px;
          text-align: center;
        }
        .shipments-table table {
          width: 100%;
          border-collapse: collapse;
        }
        .shipments-table th {
          background: #F3F4F6;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          border-bottom: 2px solid #E5E7EB;
        }
        .shipments-table td {
          padding: 12px;
          border-bottom: 1px solid #E5E7EB;
        }
        .shipment-row.warning { background: #FEF3C7; }
        .shipment-row.blocked { background: #FEE2E2; }
        .shipment-row.cleared:hover { background: #D1FAE5; }
        .highlight { font-weight: 600; }
        .lab-status, .compliance-status { font-weight: 600; }
        .status-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        .status-ok { background: #10B981; color: white; }
        .status-warning { background: #F59E0B; color: white; }
        .status-blocked { background: #EF4444; color: white; }
        .btn-resubmit, .btn-withdraw, .btn-audit {
          padding: 6px 12px;
          margin-right: 8px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        }
        .btn-resubmit { background: #3B82F6; color: white; }
        .btn-withdraw { background: #6B7280; color: white; }
        .btn-audit { background: #10B981; color: white; }
        .cleared { color: #059669; font-weight: 600; }
        @media (max-width: 768px) {
          .filters { flex-direction: column; }
          .filters input { min-width: unset; }
          .summary-bar { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default CulbridgeExporterDashboard;

