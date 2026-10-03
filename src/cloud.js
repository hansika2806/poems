const API_BASE = globalThis.ROSHNI_API_BASE || "http://127.0.0.1:4174/api";
const SESSION_KEY = "roshni-aur-lafz-cloud-session-v1";

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

function writeSession(session) {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

async function request(path, options = {}) {
  const session = readSession();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "The cloud room is unavailable.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function saveAuthResponse(payload) {
  writeSession({ token: payload.token || "", account: payload.account });
  return payload;
}

export function getCloudSession() {
  return readSession();
}

export async function registerAccount(input) {
  return saveAuthResponse(await request("/auth/register", { method: "POST", body: JSON.stringify(input) }));
}

export async function loginAccount(input) {
  return saveAuthResponse(await request("/auth/login", { method: "POST", body: JSON.stringify(input) }));
}

export async function getCloudAccount() {
  const payload = await request("/auth/me");
  const session = readSession();
  writeSession({ ...session, account: payload.account });
  return payload.account;
}

export async function logoutAccount() {
  try { await request("/auth/logout", { method: "POST", body: "{}" }); } finally { writeSession(null); }
}

export async function requestPasswordRecovery(email) {
  return request("/auth/recovery/request", { method: "POST", body: JSON.stringify({ email }) });
}

export async function resetPassword(input) {
  return request("/auth/recovery/reset", { method: "POST", body: JSON.stringify(input) });
}

export async function loadSessions() {
  return request("/auth/sessions");
}

export async function revokeSession(sessionId) {
  return request(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export async function getCloudSecurityStatus() {
  return request("/security/status");
}

export async function loadRemoteWorkspace() {
  return request("/workspace");
}

export async function saveRemoteWorkspace(workspace, baseRevision) {
  return request("/workspace", { method: "PUT", body: JSON.stringify({ workspace, baseRevision }) });
}

export async function synthesizeCloudSpeech(input) {
  return request("/tts/synthesize", { method: "POST", body: JSON.stringify(input) });
}

export async function synthesizeGoogleTranslate(input) {
  return request("/tts/google-translate", { method: "POST", body: JSON.stringify(input) });
}

export async function getCloudTtsStatus() {
  return request("/tts/status");
}

export async function recognizePoemImage(input) {
  return request("/import/ocr", { method: "POST", body: JSON.stringify(input) });
}

export async function deleteCloudAccount(password) {
  const result = await request("/account", { method: "DELETE", body: JSON.stringify({ password }) });
  writeSession(null);
  return result;
}
