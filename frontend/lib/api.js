const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// Do NOT crash app on missing env (safer for build/deploy)
if (!BASE_URL && typeof window !== "undefined") {
  console.error("Missing NEXT_PUBLIC_API_URL");
}

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("culbridge_access_token") || "";
}

// 🔴 timeout wrapper (prevents infinite "Failed to fetch")
function fetchWithTimeout(url, options = {}, timeout = 15000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), timeout)
    )
  ]);
}

async function request(path, options = {}) {
  if (!BASE_URL) {
    throw new Error("API base URL not configured");
  }

  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    ...options,
    headers
  });

  // safer error handling
  if (!res.ok) {
    let message = "";
    try {
      message = await res.text();
    } catch {
      message = "Unknown error";
    }

    throw new Error(`API ${res.status}: ${message}`);
  }

  // handle empty responses safely
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  health: () => request("/api/v1/health"),

  getShipments: () => request("/api/v1/shipments"),
  getShipment: (id) => request(`/api/v1/shipments/${id}`),

  getLabs: () => request("/api/v1/labs"),

  validate: (data) =>
    request("/api/v1/validate", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  emergencyCheck: (data) =>
    request("/api/v1/emergency-check", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  getEvaluations: (id) =>
    request(`/api/v1/shipments/${id}/evaluations`),

  getRules: () => request("/api/v1/rules"),

  get: (path) => request(path),

  post: (path, body) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body)
    })
};

export default api;