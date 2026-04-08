/**
 * CulbridgeAdminDashboard.jsx
 * Production-ready Internal Admin Dashboard.
 * Real API calls. Role-based permissions.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// CONFIG
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/v1';
const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL || 'ws://localhost:3000/v1';

// AUTH - Replace
function getToken() { return localStorage.getItem("culbridge_access_token") || ""; }
function getUserRole() { return localStorage.getItem("culbridge_user_role") || "compliance_officer"; }
function getUserName() { return localStorage.getItem("culbridge_user_name") || "Team Member"; }

// Permissions
const can = {
  override: role => role === "admin" || role === "founder",
  manageRasff: role => role === "admin" || role === "founder",
  exportAudit: role => role === "admin" || role === "founder",
  seeFullHealth: role => role === "admin" || role === "founder",
  seeFounderAttr: role => role === "founder",
};

// NAV
const NAV_ITEMS = [
  { id: "shipments", label: "Shipments", icon: "📦" },
  { id: "rasff", label: "RASFF Alerts", icon: "🚨" },
  { id: "health", label: "System Health", icon: "🩺" },
  { id: "audit", label: "Audit Log", icon: "📋" },
];

// API CALL
async function apiCall(method, path, body) {
  const token = getToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);
  
  const res = await fetch(`${API_BASE}${path}`, config);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("pdf") || ct.includes("csv")) return await res.blob();
  return await res.json();
}

// DOWNLOAD
async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// STYLES (inline)
const C = {
  navyDeep: "#08131F", navyMid: "#0D1F33", navyLight: "#112236", border: "#1E3A5F",
  orange: "#F97316", green: "#059669", amber: "#D97706", red: "#DC2626", blue: "#2563EB",
  text: "#E8EDF2", textMuted: "#7A95B0", textFaint: "#3D5A75", inputBg: "#0D1F33"
};

const FONT = "'Outfit', sans-serif";

// PRIMITIVES
function Spinner({ size = 16, color = C.orange }) {
  return <div style={{width: size, height: size, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: color, borderRadius: "50%", animation: "spin 0.75s linear infinite"}} />;
}

function Button({ children, onClick, variant="primary", size="md", disabled, loading, className="" }) {
  const variants = {
    primary: {bg: disabled ? C.border : C.orange, color: disabled ? C.textFaint : C.navy},
    danger: {bg: C.red, color: C.white},
    secondary: {bg: "transparent", color: C.text, border: `1px solid ${C.border}`},
    override: {bg: C.amber, color: C.navy},
    green: {bg: C.green, color: C.white},
    red: {bg: C.red, color: C.white},
    amber: {bg: C.amber, color: C.white},
  };
  const sizes = {
    sm: { padding: "10px 16px", fontSize: 13 },
    xs: { padding: "6px 10px", fontSize: 11 },
  };
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.sm;
  return (
    <button className={className} disabled={disabled||loading} onClick={onClick} style={{
      ...v, ...s, borderRadius: 8, fontWeight: 600,
      border: v.border || "none", cursor: loading ? "wait" : disabled ? "not-allowed" : "pointer",
      display: "flex", gap: 6, alignItems: "center", opacity: disabled && !loading ? 0.5 : 1
    }}>
      {loading && <Spinner size={13} />}
      {children}
    </button>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    CLEARED: { bg: C.greenLight, border: C.greenBorder, color: C.green, label: "Cleared" },
    WARNING: { bg: C.amberLight, border: C.amberBorder, color: C.amber, label: "Warning" },
    BLOCKED: { bg: C.redLight, border: C.redBorder, color: C.red, label: "Blocked" },
  }[status] || {};
  return <span style={{padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color}}>{cfg.label}</span>;
}

function Sidebar({ currentView, setCurrentView, role }) {
  return (
    <div style={{width: 260, background: C.navyMid, padding: 24, height: "100vh", display: "flex", flexDirection: "column", gap: 16}}>
      <div style={{fontSize: 20, fontWeight: 800, color: C.white, marginBottom: 32}}>Culbridge Admin</div>
      {NAV_ITEMS.map(item => (
        <button key={item.id} onClick={() => setCurrentView(item.id)} style={{
          width: "100%", padding: 16, textAlign: "left", background: currentView === item.id ? C.navyLight : "transparent",
          borderRadius: 10, border: `1px solid ${C.border}`, color: C.text, fontWeight: 600, cursor: "pointer"
        }}>
          <span style={{marginRight: 12, fontSize: 18}}>{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div style={{marginTop: "auto", paddingTop: 32, borderTop: `1px solid ${C.border}`}>
        <div style={{fontSize: 13, color: C.textMuted, marginBottom: 8}}>Logged in as</div>
        <div style={{fontSize: 15, fontWeight: 600, color: C.text}}>{getUserName()}</div>
        <div style={{fontSize: 12, color: C.textFaint}}>{getUserRole()}</div>
      </div>
    </div>
  );
}

function ShipmentTable({ role, onRefresh }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const loadShipments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('GET', '/admin/shipments');
      setShipments(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  const blockShipment = async (id) => {
    const reason = prompt("Reason for blocking?");
    if (reason) {
      try {
        await apiCall('POST', `/admin/shipments/${id}/block`, { reason });
        loadShipments();
      } catch (e) {
        alert("Block failed: " + e.message);
      }
    }
  };

  const overrideClear = async (id) => {
    if (!can.override(role)) {
      alert("Permission denied");
      return;
    }
    const reason = prompt("Reason for override?");
    if (reason) {
      try {
        await apiCall('POST', `/admin/shipments/${id}/override`, { reason, action: "clear" });
        loadShipments();
      } catch (e) {
        alert("Override failed: " + e.message);
      }
    }
  };

  const sendEmail = async (id) => {
    try {
      await apiCall('POST', `/admin/shipments/${id}/contact/email`);
      alert("Email sent");
    } catch (e) {
      alert("Email failed: " + e.message);
    }
  };

  const sendSMS = async (id) => {
    try {
      await apiCall('POST', `/admin/shipments/${id}/contact/sms`);
      alert("SMS sent");
    } catch (e) {
      alert("SMS failed: " + e.message);
    }
  };

  const escalate = async (id) => {
    const body = prompt("Escalation body (NEPC/NINAS)?");
    if (body) {
      try {
        await apiCall('POST', `/admin/shipments/${id}/escalate`, { body });
        loadShipments();
      } catch (e) {
        alert("Escalation failed: " + e.message);
      }
    }
  };

  const setPriority = async (id, priority) => {
    try {
      await apiCall('PATCH', `/admin/shipments/${id}/priority`, { priority });
      loadShipments();
    } catch (e) {
      alert("Priority update failed: " + e.message);
    }
  };

  const assignShipment = async (id) => {
    const userId = prompt("Assign to user ID?");
    if (userId) {
      try {
        await apiCall('PATCH', `/admin/shipments/${id}/assign`, { userId });
        loadShipments();
      } catch (e) {
        alert("Assign failed: " + e.message);
      }
    }
  };

  // Feedback loop: Submit decision accuracy feedback
  const submitDecisionFeedback = async (shipmentId, isCorrect) => {
    try {
      await apiCall('POST', '/feedback', {
        shipment_id: shipmentId,
        event_type: 'DECISION_ACCURACY',
        value: isCorrect ? 'TRUE_POSITIVE' : 'FALSE_POSITIVE',
        metadata: { rule: 'ADMIN_BLOCK', timestamp: new Date().toISOString() }
      });
      alert(isCorrect ? 'Feedback recorded: Block was correct' : 'Feedback recorded: Block was incorrect');
    } catch (e) {
      alert("Feedback failed: " + e.message);
    }
  };

  // Feedback loop: Submit fix result feedback
  const submitFixFeedback = async (shipmentId, fixed) => {
    try {
      await apiCall('POST', '/feedback', {
        shipment_id: shipmentId,
        event_type: 'FIX_RESULT',
        value: fixed ? 'FIX_SUCCESS' : 'FIX_FAILED',
        metadata: { timestamp: new Date().toISOString() }
      });
      alert(fixed ? 'Feedback recorded: Fix resolved the issue' : 'Feedback recorded: Fix did not work');
    } catch (e) {
      alert("Feedback failed: " + e.message);
    }
  };

  // Feedback loop: Submit final outcome
  const submitOutcome = async (shipmentId, outcome) => {
    try {
      await apiCall('POST', `/shipments/${shipmentId}/outcome`, {
        value: outcome
      });
      alert('Outcome recorded: ' + outcome);
      loadShipments();
    } catch (e) {
      alert("Outcome failed: " + e.message);
    }
  };

  return (
    <div style={{flex: 1, padding: 24}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24}}>
        <h1 style={{fontSize: 28, fontWeight: 800, color: C.text}}>Shipments ({shipments.length})</h1>
        <div style={{display: "flex", gap: 12}}>
          <Button onClick={loadShipments} loading={loading}>Refresh</Button>
          <Button variant="secondary" onClick={onRefresh}>Health</Button>
        </div>
      </div>

      <div style={{background: C.navyLight, borderRadius: 12, padding: 20, marginBottom: 24}}>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr)", gap: 24}}>
          {[
            { label: "Total", value: shipments.length, color: C.text },
            { label: "Cleared", value: shipments.filter(s => s.complianceStatus === "CLEARED").length, color: C.green },
            { label: "Blocked", value: shipments.filter(s => s.complianceStatus === "BLOCKED").length, color: C.red },
            { label: "Escalated", value: shipments.filter(s => s.escalated).length, color: C.amber }
          ].map(stat => (
            <div key={stat.label} style={{textAlign: "center"}}>
              <div style={{fontSize: 32, fontWeight: 800, color: stat.color}}>{stat.value}</div>
              <div style={{fontSize: 13, color: C.textMuted}}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{overflow: "auto", maxHeight: "calc(100vh - 280px)"}}>
        <table style={{width: "100%", borderCollapse: "collapse"}}>
          <thead>
            <tr style={{background: C.navy}}>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "left", whiteSpace: "nowrap"}}>ID</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "left"}}>Exporter</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "left"}}>Commodity</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "center"}}>NEPC</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "center"}}>RASFF</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "center"}}>Lab</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "center"}}>Status</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "center"}}>Priority</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600, textAlign: "center", width: 320}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map(shipment => (
              <tr key={shipment.id} style={{background: C.navyDeep}}>
                <td style={{padding: "16px 12px"}}>
                  <div style={{fontWeight: 600, color: C.text}}>{shipment.id}</div>
                  <div style={{fontSize: 12, color: C.textFaint, marginTop: 2}}>{formatDateTime(shipment.submittedAt)}</div>
                </td>
                <td style={{padding: "16px 12px"}}>
                  <div style={{fontWeight: 600}}>{shipment.exporter_name}</div>
                </td>
                <td style={{padding: "16px 12px", fontWeight: 600}}>{shipment.commodity}</td>
                <td style={{padding: "16px 12px", textAlign: "center"}}>
                  <StatusBadge status={shipment.nepcVerified ? "CLEARED" : "BLOCKED"} />
                </td>
                <td style={{padding: "16px 12px", textAlign: "center"}}>
                  <Badge label={shipment.rasffAlertCount || "0"} color={C.text} bg={C.navyLight} border="none" />
                </td>
                <td style={{padding: "16px 12px", textAlign: "center"}}>
                  <StatusBadge status={shipment.labResult || "PENDING"} />
                </td>
                <td style={{padding: "16px 12px", textAlign: "center"}}>
                  <StatusBadge status={shipment.complianceStatus} />
                </td>
                <td style={{padding: "16px 12px", textAlign: "center"}}>
                  <Button 
                    size="sm" variant={shipment.priority ? "green" : "secondary"} 
                    onClick={() => setPriority(shipment.id, !shipment.priority)}
                  >
                    {shipment.priority ? "HIGH" : "Normal"}
                  </Button>
                </td>
                <td style={{padding: "16px 12px", display: "flex", gap: 8, flexWrap: "wrap"}}>
                  <Button size="sm" onClick={() => blockShipment(shipment.id)}>Block</Button>
                  {can.override(role) && <Button size="sm" variant="override" onClick={() => overrideClear(shipment.id)}>Override</Button>}
                  <Button size="sm" variant="secondary" onClick={() => sendEmail(shipment.id)}>📧 Email</Button>
                  <Button size="sm" variant="secondary" onClick={() => sendSMS(shipment.id)}>📱 SMS</Button>
                  <Button size="sm" variant="secondary" onClick={() => escalate(shipment.id)}>Escalate</Button>
                  <Button size="sm" variant="secondary" onClick={() => assignShipment(shipment.id)}>Assign</Button>
                  {/* Feedback Loop: Decision Accuracy */}
                  {(shipment.complianceStatus === 'BLOCKER' || shipment.nepcVerified === false) && (
                    <div style={{display: 'flex', gap: 4, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`}}>
                      <span style={{fontSize: 11, color: C.textFaint, marginRight: 4}}>Block correct?</span>
                      <Button size="xs" variant="green" onClick={() => submitDecisionFeedback(shipment.id, true)}>✅ Yes</Button>
                      <Button size="xs" variant="red" onClick={() => submitDecisionFeedback(shipment.id, false)}>❌ No</Button>
                    </div>
                  )}
                  {/* Feedback Loop: Fix Result (show after lab/doc upload) */}
                  {shipment.labResult && (
                    <div style={{display: 'flex', gap: 4, marginTop: 8}}>
                      <span style={{fontSize: 11, color: C.textFaint, marginRight: 4}}>Fix worked?</span>
                      <Button size="xs" variant="green" onClick={() => submitFixFeedback(shipment.id, true)}>Yes</Button>
                      <Button size="xs" variant="red" onClick={() => submitFixFeedback(shipment.id, false)}>No</Button>
                    </div>
                  )}
                  {/* Feedback Loop: Outcome Capture (show for completed shipments without outcome) */}
                  {shipment.status === 'COMPLETED' && !shipment.final_outcome && (
                    <div style={{display: 'flex', gap: 4, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`}}>
                      <span style={{fontSize: 11, color: C.textFaint, marginRight: 4}}>Outcome:</span>
                      <Button size="xs" variant="green" onClick={() => submitOutcome(shipment.id, 'CLEARED')}>Cleared</Button>
                      <Button size="xs" variant="amber" onClick={() => submitOutcome(shipment.id, 'DELAYED')}>Delayed</Button>
                      <Button size="xs" variant="red" onClick={() => submitOutcome(shipment.id, 'REJECTED')}>Rejected</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan="9" style={{padding: "40px", textAlign: "center"}}>
                  <Spinner size={24} />
                </td>
              </tr>
            )}
            {!loading && shipments.length === 0 && (
              <tr>
                <td colSpan="9" style={{padding: "40px", textAlign: "center", color: C.textFaint}}>
                  No shipments found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RasffAlerts({ role }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadAlerts = useCallback(async () => {
    if (!can.manageRasff(role)) return;
    setLoading(true);
    try {
      const res = await apiCall('GET', '/admin/rasff');
      setAlerts(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [role]);

  const acknowledge = async (id) => {
    try {
      await apiCall('PATCH', `/admin/rasff/${id}/acknowledge`);
      loadAlerts();
    } catch (e) {
      alert("Acknowledge failed");
    }
  };

  const dismiss = async (id) => {
    try {
      await apiCall('PATCH', `/admin/rasff/${id}/dismiss`);
      loadAlerts();
    } catch (e) {
      alert("Dismiss failed");
    }
  };

  const addNote = async (id, note) => {
    try {
      await apiCall('PATCH', `/admin/rasff/${id}/notes`, { note });
      loadAlerts();
    } catch (e) {
      alert("Note failed");
    }
  };

  return (
    <div style={{flex: 1, padding: 24}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24}}>
        <h1 style={{fontSize: 28, fontWeight: 800, color: C.text}}>RASFF Alerts ({alerts.length})</h1>
        <Button onClick={loadAlerts} loading={loading} variant="secondary">Refresh</Button>
      </div>
      <table style={{width: "100%", borderCollapse: "collapse"}}>
        <thead>
          <tr style={{background: C.navy}}>
            <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Product</th>
            <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Risk</th>
            <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Date</th>
            <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Notes</th>
            <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map(alert => (
            <tr key={alert.id} style={{background: C.navyDeep}}>
              <td style={{padding: "16px 12px"}}>{alert.product}</td>
              <td style={{padding: "16px 12px"}}>
                <StatusBadge status={alert.severity} />
              </td>
              <td style={{padding: "16px 12px"}}>{formatDate(alert.date)}</td>
              <td style={{padding: "16px 12px"}}>
                <Input 
                  value={alert.notes || ""} 
                  onChange={v => addNote(alert.id, v)} 
                  placeholder="Add note..."
                  size="sm"
                />
              </td>
              <td style={{padding: "16px 12px", display: "flex", gap: 8}}>
                <Button size="sm" onClick={() => acknowledge(alert.id)} variant="green">Acknowledge</Button>
                <Button size="sm" onClick={() => dismiss(alert.id)} variant="secondary">Dismiss</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SystemHealth() {
  const [health, setHealth] = useState({});
  const [loading, setLoading] = useState(false);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('GET', '/admin/health');
      setHealth(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  return (
    <div style={{flex: 1, padding: 24}}>
      <div style={{display: "flex", justifyContent: "space-between", marginBottom: 24}}>
        <h1 style={{fontSize: 28, fontWeight: 800, color: C.text}}>System Health</h1>
        <Button onClick={loadHealth} loading={loading}>Refresh</Button>
      </div>
      
      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr)", gap: 24}}>
        {Object.entries(health).map(([service, status]) => (
          <div key={service} style={{padding: 20, borderRadius: 12, background: C.navyLight}}>
            <div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 12}}>
              <div style={{width: 40, height: 40, borderRadius: 8, background: status === "UP" ? C.greenLight : status === "DEGRADED" ? C.amberLight : C.redLight, display: "flex", alignItems: "center", justifyContent: "center"}}>
                {status}
              </div>
              <div>
                <div style={{fontSize: 18, fontWeight: 700}}>{service}</div>
                <div style={{fontSize: 13, color: C.textMuted}}>Last check: {formatDateTime(health.timestamp)}</div>
              </div>
            </div>
            <div style={{fontSize: 13, lineHeight: 1.6, color: C.textFaint}}>
              {status === "UP" ? "All systems nominal" : status === "DEGRADED" ? "Partial outage" : "Service down"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('GET', '/admin/audit');
      setLogs(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const exportAudit = async () => {
    try {
      const blob = await apiCall('GET', '/admin/audit/export?format=csv');
      downloadBlob(blob, 'culbridge-audit.csv');
    } catch (e) {
      alert("Export failed");
    }
  };

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div style={{flex: 1, padding: 24}}>
      <div style={{display: "flex", justifyContent: "space-between", marginBottom: 24}}>
        <h1 style={{fontSize: 28, fontWeight: 800, color: C.text}}>Audit Log ({logs.length})</h1>
        <Button onClick={exportAudit}>Export CSV</Button>
      </div>
      
      <div style={{overflow: "auto", maxHeight: "calc(100vh - 160px)"}}>
        <table style={{width: "100%", borderCollapse: "collapse"}}>
          <thead>
            <tr style={{background: C.navy}}>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Timestamp</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Shipment</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Event</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Actor</th>
              <th style={{padding: "16px 12px", color: C.textMuted, fontWeight: 600}}>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} style={{background: C.navyDeep}}>
                <td style={{padding: "16px 12px", fontSize: 12, color: C.textFaint}}>{formatDateTime(log.timestamp)}</td>
                <td style={{padding: "16px 12px"}}>{log.shipment_id}</td>
                <td style={{padding: "16px 12px"}}>{log.event}</td>
                <td style={{padding: "16px 12px"}}>{log.actor || getUserName()}</td>
                <td style={{padding: "16px 12px", fontSize: 13}}>{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MainContent({ currentView, role, onRefresh }) {
  switch (currentView) {
    case "shipments": return <ShipmentTable role={role} onRefresh={onRefresh} />;
    case "rasff":     return <RasffAlerts role={role} />;
    case "health":    return <SystemHealth />;
    case "audit":     return <AuditLog />;
    default:          return <div>Select a view</div>;
  }
}

function CulbridgeAdminDashboard() {
  const [currentView, setCurrentView] = useState("shipments");
  const [role, setRole] = useState(getUserRole());
  const [userName, setUserName] = useState(getUserName());
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);

  // Connect WS
  useEffect(() => {
    const token = getToken();
    const ws = new WebSocket(`${WS_BASE}/ws/admin?token=${token}`);
    
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  const handleRefresh = () => {
    // Trigger full refresh
    window.location.reload();
  };

  return (
    <div style={{display: "flex", height: "100vh"}}>
      <StyleInjector />
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} role={role} />
      <div style={{flex: 1, overflow: "hidden"}}>
        <MainContent currentView={currentView} role={role} onRefresh={handleRefresh} />
      </div>
    </div>
  );
}

export default CulbridgeAdminDashboard;

