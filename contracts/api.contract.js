const API_CONTRACT = {
  // Core endpoints
  health: { method: "GET", path: "/api/v1/health" },
  getShipments: { method: "GET", path: "/api/v1/shipments" },
  getShipment: { method: "GET", path: "/api/v1/shipments/:id" },
  getLabs: { method: "GET", path: "/api/v1/labs" },
  validate: { method: "POST", path: "/api/v1/validate" },
  emergencyCheck: { method: "POST", path: "/api/v1/emergency-check" },
  getEvaluations: { method: "GET", path: "/api/v1/shipments/:id/evaluations" },
  getRules: { method: "GET", path: "/api/v1/rules" },
  
  // Admin endpoints
  adminShipments: { method: "GET", path: "/api/v1/admin/shipments" },
  adminShipmentBlock: { method: "POST", path: "/api/v1/admin/shipments/:id/block" },
  adminShipmentOverride: { method: "POST", path: "/api/v1/admin/shipments/:id/override" },
  adminShipmentContactEmail: { method: "POST", path: "/api/v1/admin/shipments/:id/contact/email" },
  adminShipmentContactSms: { method: "POST", path: "/api/v1/admin/shipments/:id/contact/sms" },
  adminShipmentEscalate: { method: "POST", path: "/api/v1/admin/shipments/:id/escalate" },
  adminShipmentPriority: { method: "PATCH", path: "/api/v1/admin/shipments/:id/priority" },
  adminShipmentAssign: { method: "PATCH", path: "/api/v1/admin/shipments/:id/assign" },
  adminRasff: { method: "GET", path: "/api/v1/admin/rasff" },
  adminRasffAcknowledge: { method: "PATCH", path: "/api/v1/admin/rasff/:id/acknowledge" },
  adminRasffDismiss: { method: "PATCH", path: "/api/v1/admin/rasff/:id/dismiss" },
  adminRasffNotes: { method: "PATCH", path: "/api/v1/admin/rasff/:id/notes" },
  adminHealth: { method: "GET", path: "/api/v1/admin/health" },
  adminAudit: { method: "GET", path: "/api/v1/admin/audit" },
  adminAuditExport: { method: "GET", path: "/api/v1/admin/audit/export" },
  
  // Shipment management
  shipmentPreSubmitCheck: { method: "POST", path: "/api/v1/shipments/pre-submit-check" },
  shipmentCreate: { method: "POST", path: "/api/v1/shipments" },
  shipmentOutcome: { method: "POST", path: "/api/v1/shipments/:id/outcome" },
  
  // Other
  feedback: { method: "POST", path: "/api/v1/feedback" },
  requirements: { method: "GET", path: "/api/v1/requirements" },
  engineEvaluate: { method: "POST", path: "/api/v1/engine/evaluate" }
};

for (const key in API_CONTRACT) {
  const route = API_CONTRACT[key];
  if (!route.path.startsWith("/api/v1/")) {
    throw new Error(`Contract violation: ${key} missing /api/v1`);
  }
}

module.exports = { API_CONTRACT };