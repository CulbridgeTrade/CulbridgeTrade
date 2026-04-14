const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!BASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_API_URL");
}

function getToken() {
  return typeof window !== "undefined" 
    ? localStorage.getItem("culbridge_access_token") || "" 
    : "";
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error: ${res.status} - ${text}`);
  }

  return res.json();
}

export const api = {
  health: () => request("/api/v1/health"),
  getShipments: () => request("/api/v1/shipments"),
  getShipment: (id) => request(`/api/v1/shipments/${id}`),
  getLabs: () => request("/api/v1/labs"),
  validate: (data) => request("/api/v1/validate", { method: "POST", body: JSON.stringify(data) }),
  emergencyCheck: (data) => request("/api/v1/emergency-check", { method: "POST", body: JSON.stringify(data) }),
  getEvaluations: (id) => request(`/api/v1/shipments/${id}/evaluations`),
  getRules: () => request("/api/v1/rules"),
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) })
};

export default api;