const TOKEN_KEY = "skillnexa_token";
let token = localStorage.getItem(TOKEN_KEY) || "";
export function setToken(value) { token = value || ""; if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); }
export function getToken() { return token; }
export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(path, { ...options, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`);
  return data;
}