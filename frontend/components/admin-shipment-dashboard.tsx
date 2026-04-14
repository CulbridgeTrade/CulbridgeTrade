/**
 * AdminShipmentDashboard.tsx
 * Real-time overview of all shipments for admin/compliance users.
 * Supports WebSocket for live updates and auto-refresh fallback.
 */

import { useState, useEffect, useCallback } from "react";
import api from "../lib/api";

const getToken = () => localStorage.getItem("culbridge_access_token") || "";

const C = {
  navyDeep: "#08131F",
  navyMid: "#0D1F33",
  navyLight: "#112236",
  border: "#1E3A5F",
  orange: "#F97316",
  green: "#059669",
  amber: "#D97706",
  red: "#DC2626",
  blue: "#2563EB",
  text: "#E8EDF2",
  textMuted: "#7A95B0",
  textFaint: "#3D5A75",
};

function Spinner({ size = 16, color = C.orange }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: "2px solid rgba(255,255,255,0.08)",
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.75s linear infinite",
      }}
    />
  );
}

async function apiCall(method: string, path: string, body?: unknown) {
  const token = getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const config: RequestInit = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, config);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return await res.json();
}

interface Shipment {
  id: string;
  shipmentId: string;
  exporterName: string;
  commodity: string;
  origin: string;
  destination: string;
  status: "pending" | "approved" | "rejected" | "under_review";
  submittedAt: string;
  updatedAt: string;
  assignedTo?: string;
  complianceScore?: number;
}

interface Stats {
  totalToday: number;
  totalTodayTrend: number;
  pendingReview: number;
  avgWaitTime: number;
  approved: number;
  approvalRate: number;
  rejected: number;
  topRejectionReasons: string[];
  queueDepth: number;
}

interface Activity {
  id: string;
  type: "submission" | "approval" | "rejection" | "comment";
  message: string;
  timestamp: string;
  user: string;
}

interface FilterState {
  status: string[];
  dateRange: { start: string; end: string };
  exporter: string;
  commodity: string;
}

const initialFilters: FilterState = {
  status: [],
  dateRange: { start: "", end: "" },
  exporter: "",
  commodity: "",
};

const AdminShipmentDashboard = ({
  onFilterChange,
  onShipmentAction,
}: {
  onFilterChange?: (filters: FilterState) => void;
  onShipmentAction?: (action: string, shipment: Shipment) => void;
}) => {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalToday: 0,
    totalTodayTrend: 0,
    pendingReview: 0,
    avgWaitTime: 0,
    approved: 0,
    approvalRate: 0,
    rejected: 0,
    topRejectionReasons: [],
    queueDepth: 0,
  });
  const [activity, setActivity] = useState<Activity[]>([]);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status.length > 0) params.set("status", filters.status.join(","));
      if (filters.dateRange.start) params.set("startDate", filters.dateRange.start);
      if (filters.dateRange.end) params.set("endDate", filters.dateRange.end);
      if (filters.exporter) params.set("exporter", filters.exporter);
      if (filters.commodity) params.set("commodity", filters.commodity);

      const [shipmentsData, statsData, activityData] = await Promise.all([
        apiCall("GET", `/api/v1/shipments?${params.toString()}`),
        apiCall("GET", "/api/v1/shipments/stats"),
        apiCall("GET", "/api/v1/shipments/activity?limit=20"),
      ]);

      setShipments(shipmentsData.shipments || shipmentsData || []);
      setStats(statsData || stats);
      setActivity(activityData.activity || activityData || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${WS_BASE}/ws/shipments`);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "shipment_update") {
          setShipments((prev) =>
            prev.map((s) => (s.id === data.shipment.id ? data.shipment : s))
          );
          showToast(`Shipment ${data.shipment.shipmentId} updated`);
        } else if (data.type === "new_shipment") {
          setShipments((prev) => [data.shipment, ...prev]);
          showToast(`New shipment: ${data.shipment.shipmentId}`);
        }
      };
    } catch (error) {
      console.error("WebSocket connection failed:", error);
    }
    return () => ws?.close();
  }, []);

  const showToast = (message: string) => {
    const toast = document.createElement("div");
    toast.className = "shipment-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${C.navyMid};
      color: ${C.text};
      padding: 12px 20px;
      border-radius: 8px;
      border-left: 4px solid ${C.orange};
      z-index: 9999;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  };

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);
    onFilterChange?.(updated);
  };

  const handleShipmentAction = (action: string, shipment: Shipment) => {
    onShipmentAction?.(action, shipment);
  };

  const formatDateTime = (iso: string) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleString();
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  if (loading) {
    return (
      <div className="admin-shipment-dashboard-loading" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: C.navyDeep, color: C.text }}>
        <Spinner size={32} />
        <span style={{ marginLeft: 12 }}>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="admin-shipment-dashboard" style={{ display: "flex", minHeight: "100vh", background: C.navyDeep, color: C.text, fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .stats-card { background: ${C.navyMid}; border: 1px solid ${C.border}; border-radius: 12px; padding: 20px; }
        .stats-value { font-size: 28px; font-weight: 700; }
        .stats-label { font-size: 13px; color: ${C.textMuted}; margin-top: 4px; }
        .stats-trend { font-size: 12px; margin-left: 8px; }
        .stats-trend.up { color: ${C.green}; }
        .stats-trend.down { color: ${C.red}; }
        .filter-section { background: ${C.navyMid}; border-right: 1px solid ${C.border}; padding: 20px; width: 260px; }
        .filter-group { margin-bottom: 20px; }
        .filter-label { font-size: 12px; color: ${C.textMuted}; margin-bottom: 8px; display: block; }
        .filter-input, .filter-select { width: 100%; background: ${C.navyLight}; border: 1px solid ${C.border}; border-radius: 6px; padding: 10px; color: ${C.text}; font-size: 13px; }
        .filter-input:focus, .filter-select:focus { outline: none; border-color: ${C.orange}; }
        .main-content { flex: 1; padding: 24px; overflow-y: auto; }
        .shipment-table { width: 100%; border-collapse: collapse; background: ${C.navyMid}; border-radius: 12px; overflow: hidden; }
        .shipment-table th { background: ${C.navyLight}; padding: 14px 16px; text-align: left; font-size: 12px; color: ${C.textMuted}; font-weight: 600; text-transform: uppercase; }
        .shipment-table td { padding: 14px 16px; border-top: 1px solid ${C.border}; font-size: 13px; }
        .shipment-table tr:hover { background: ${C.navyLight}; }
        .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .status-pending { background: rgba(249, 115, 22, 0.15); color: ${C.orange}; }
        .status-under_review { background: rgba(217, 119, 6, 0.15); color: ${C.amber}; }
        .status-approved { background: rgba(5, 150, 105, 0.15); color: ${C.green}; }
        .status-rejected { background: rgba(220, 38, 38, 0.15); color: ${C.red}; }
        .action-btn { background: transparent; border: 1px solid ${C.border}; color: ${C.text}; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-right: 6px; }
        .action-btn:hover { border-color: ${C.orange}; color: ${C.orange}; }
        .ws-indicator { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .ws-dot { width: 8px; height: 8px; border-radius: 50%; }
        .ws-dot.connected { background: ${C.green}; }
        .ws-dot.disconnected { background: ${C.red}; }
        .activity-feed { background: ${C.navyMid}; border-radius: 12px; padding: 16px; margin-top: 24px; }
        .activity-item { padding: 10px 0; border-bottom: 1px solid ${C.border}; font-size: 13px; }
        .activity-item:last-child { border-bottom: none; }
        .activity-time { color: ${C.textFaint}; font-size: 11px; margin-left: 8px; }
      `}</style>

      <aside className="filter-section">
        <h3 style={{ marginBottom: 24, fontSize: 16 }}>Filters</h3>
        
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <select
            className="filter-select"
            value={filters.status[0] || ""}
            onChange={(e) => handleFilterChange({ status: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Date Range</label>
          <input
            type="date"
            className="filter-input"
            value={filters.dateRange.start}
            onChange={(e) => handleFilterChange({ dateRange: { ...filters.dateRange, start: e.target.value } })}
            style={{ marginBottom: 8 }}
          />
          <input
            type="date"
            className="filter-input"
            value={filters.dateRange.end}
            onChange={(e) => handleFilterChange({ dateRange: { ...filters.dateRange, end: e.target.value } })}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Exporter</label>
          <input
            type="text"
            className="filter-input"
            placeholder="Search exporter..."
            value={filters.exporter}
            onChange={(e) => handleFilterChange({ exporter: e.target.value })}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Commodity</label>
          <input
            type="text"
            className="filter-input"
            placeholder="Search commodity..."
            value={filters.commodity}
            onChange={(e) => handleFilterChange({ commodity: e.target.value })}
          />
        </div>
      </aside>

      <main className="main-content">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Shipment Oversight</h2>
          <div className="ws-indicator">
            <span className={`ws-dot ${wsConnected ? "connected" : "disconnected"}`}></span>
            <span>{wsConnected ? "Live" : "Reconnecting..."}</span>
            <span style={{ color: C.textFaint, marginLeft: 12 }}>Last refresh: {lastRefresh.toLocaleTimeString()}</span>
          </div>
        </header>

        <section className="stats-row" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
          <div className="stats-card">
            <div className="stats-value">{stats.totalToday}</div>
            <div className="stats-label">
              Total Today
              <span className={`stats-trend ${stats.totalTodayTrend >= 0 ? "up" : "down"}`}>
                {stats.totalTodayTrend >= 0 ? "↑" : "↓"} {Math.abs(stats.totalTodayTrend)}%
              </span>
            </div>
          </div>
          <div className="stats-card">
            <div className="stats-value">{stats.pendingReview}</div>
            <div className="stats-label">Pending Review ({formatTime(stats.avgWaitTime)})</div>
          </div>
          <div className="stats-card">
            <div className="stats-value">{stats.approved}</div>
            <div className="stats-label">
              Approved
              <span className="stats-trend up">{(stats.approvalRate * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="stats-card">
            <div className="stats-value">{stats.rejected}</div>
            <div className="stats-label">
              Rejected
              {stats.topRejectionReasons[0] && (
                <span style={{ display: "block", fontSize: 11, color: C.textFaint, marginTop: 4 }}>
                  Top: {stats.topRejectionReasons[0]}
                </span>
              )}
            </div>
          </div>
          <div className="stats-card">
            <div className="stats-value">{stats.queueDepth}</div>
            <div className="stats-label">Queue Depth</div>
          </div>
        </section>

        <section className="shipments-section">
          <table className="shipment-table">
            <thead>
              <tr>
                <th>Shipment ID</th>
                <th>Exporter</th>
                <th>Commodity</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: 40, color: C.textMuted }}>
                    No shipments found
                  </td>
                </tr>
              ) : (
                shipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td style={{ fontWeight: 600 }}>{shipment.shipmentId}</td>
                    <td>{shipment.exporterName}</td>
                    <td>{shipment.commodity}</td>
                    <td>{shipment.origin}</td>
                    <td>{shipment.destination}</td>
                    <td>
                      <span className={`status-badge status-${shipment.status}`}>
                        {shipment.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>{formatDateTime(shipment.submittedAt)}</td>
                    <td>
                      <button
                        className="action-btn"
                        onClick={() => handleShipmentAction("view", shipment)}
                      >
                        View
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => handleShipmentAction("assign", shipment)}
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="activity-feed">
          <h4 style={{ marginBottom: 16, fontSize: 14 }}>Recent Activity</h4>
          {activity.map((item) => (
            <div key={item.id} className="activity-item">
              <span>{item.message}</span>
              <span className="activity-time">
                {item.user} • {formatDateTime(item.timestamp)}
              </span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
};

export default AdminShipmentDashboard;
export type { Shipment, Stats, Activity, FilterState };
