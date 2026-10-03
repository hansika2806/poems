const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Load .env file from project root if it exists (no extra packages needed)
(function loadEnv() {
  const envFile = path.join(__dirname, ".env");
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && value && !process.env[key]) process.env[key] = value;
  }
})();

const PORT = Number(process.env.PORT || 4174);
const DATA_DIR = path.join(__dirname, "server-data");
const DB_FILE = path.join(DATA_DIR, "accounts.json");
const DELETED_DB_FILE = path.join(DATA_DIR, "deleted-accounts.json");
const KEY_FILE = path.join(DATA_DIR, "encryption.key");
const SESSION_DAYS = 14;
const RECOVERY_MINUTES = 30;
const DELETION_RETENTION_DAYS = Number(process.env.DELETION_RETENTION_DAYS || 30);
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const COOKIE_SESSIONS = process.env.COOKIE_SESSIONS === "true";
const PRODUCTION_MODE = process.env.NODE_ENV === "production";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://127.0.0.1:4173";
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_KEY = process.env.ROSHNI_ADMIN_KEY || "";
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
let googleTranslateWiz = null;
let googleTranslateBatchNumber = 0;

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, file);
}

function loadEncryptionKey() {
  if (process.env.ROSHNI_ENCRYPTION_KEY) return Buffer.from(process.env.ROSHNI_ENCRYPTION_KEY, "base64");
  if (!fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString("base64"), "utf8");
  return Buffer.from(fs.readFileSync(KEY_FILE, "utf8"), "base64");
}

const keyRing = loadKeyRing();
const database = loadJson(DB_FILE, { accounts: {} });
const deletedDatabase = loadJson(DELETED_DB_FILE, { accounts: {} });

function loadKeyRing() {
  const configured = process.env.ROSHNI_ENCRYPTION_KEYS;
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      const keys = Object.fromEntries(Object.entries(parsed).map(([version, value]) => [version, Buffer.from(value, "base64")]));
      const activeVersion = process.env.ROSHNI_ACTIVE_KEY_VERSION || Object.keys(keys).sort().at(-1);
      if (activeVersion && Buffer.isBuffer(keys[activeVersion]) && keys[activeVersion].length === 32) return { keys, activeVersion };
    } catch { /* fall through to the local key file */ }
  }
  const keyRingFile = path.join(DATA_DIR, "encryption.keys.json");
  if (fs.existsSync(keyRingFile)) {
    try {
      const stored = JSON.parse(fs.readFileSync(keyRingFile, "utf8"));
      const keys = Object.fromEntries(Object.entries(stored.keys || {}).map(([version, value]) => [version, Buffer.from(value, "base64")]));
      if (stored.activeVersion && keys[stored.activeVersion]?.length === 32) return { keys, activeVersion: stored.activeVersion };
    } catch { /* fall through to the original local key file */ }
  }
  const key = loadEncryptionKey();
  return { keys: { v1: key }, activeVersion: "v1" };
}

function activeEncryptionKey() {
  return keyRing.keys[keyRing.activeVersion];
}

function purgeDeletedAccounts() {
  const cutoff = Date.now() - (DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  for (const [id, account] of Object.entries(deletedDatabase.accounts || {})) {
    if (Number(account.deletedAt || 0) < cutoff) delete deletedDatabase.accounts[id];
  }
  saveJson(DELETED_DB_FILE, deletedDatabase);
}

purgeDeletedAccounts();

function supabaseHeaders() {
  return {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };
}

async function syncAccountToSupabase(account) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !account?.id) return;
  try {
    const row = {
      id: account.id,
      email: account.email,
      display_name: account.displayName || "",
      password_record: account.password,
      sessions: account.sessions || [],
      revision: account.revision || 0,
      updated_at: account.updatedAt || now(),
      workspace: account.workspace || null,
      deleted_at: account.deletedAt || null,
      restore_until: account.restoreUntil || null
    };
    const response = await fetch(`${SUPABASE_URL}/rest/v1/accounts`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(),
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(`[Supabase] Sync failed (${response.status}):`, text);
    }
  } catch (err) {
    console.warn("[Supabase] Sync network error:", err.message);
  }
}

async function loadFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/accounts?select=*`, {
      headers: supabaseHeaders()
    });
    if (!response.ok) {
      if (response.status === 404) {
        console.log("[Supabase] 'accounts' table not found yet. Run the SQL schema in Supabase SQL Editor.");
      } else {
        const text = await response.text().catch(() => "");
        console.warn(`[Supabase] Load failed (${response.status}):`, text);
      }
      return;
    }
    const rows = await response.json();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!row.id) continue;
        const account = {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          password: row.password_record,
          sessions: row.sessions || [],
          revision: row.revision || 0,
          updatedAt: row.updated_at,
          workspace: row.workspace,
          ...(row.deleted_at ? { deletedAt: row.deleted_at, restoreUntil: row.restore_until } : {})
        };
        if (row.deleted_at) {
          deletedDatabase.accounts[row.id] = account;
        } else {
          database.accounts[row.id] = account;
        }
      }
      saveJson(DB_FILE, database);
      if (rows.length > 0) {
        console.log(`[Supabase] Synced ${rows.length} account(s) from cloud.`);
      }
    }
  } catch (err) {
    console.warn("[Supabase] Load network error:", err.message);
  }
}

loadFromSupabase();

function now() {
  return new Date().toISOString();
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return { salt: salt.toString("base64"), hash: derived.toString("base64") };
}

function verifyPassword(password, record) {
  const expected = Buffer.from(record.hash, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(record.salt, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function encryptWorkspace(workspace) {
  const iv = crypto.randomBytes(12);
  const keyVersion = keyRing.activeVersion;
  const cipher = crypto.createCipheriv("aes-256-gcm", activeEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(workspace), "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion
  };
}

function decryptWorkspace(account) {
  if (!account.workspace) return { poems: [], snippets: [], dictionary: [], capsules: [], readCounts: {}, notes: {}, draft: "", poemDraft: null, settings: {} };
  const key = keyRing.keys[account.workspace.keyVersion || "v1"];
  if (!key) throw new Error("The workspace encryption key version is not available on this server.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(account.workspace.iv, "base64"));
  decipher.setAuthTag(Buffer.from(account.workspace.tag, "base64"));
  const data = Buffer.concat([
    decipher.update(Buffer.from(account.workspace.ciphertext, "base64")),
    decipher.final()
  ]);
  return JSON.parse(data.toString("utf8"));
}

function accountView(account) {
  return { id: account.id, email: account.email, displayName: account.displayName, revision: account.revision, updatedAt: account.updatedAt };
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => part.trim().split("=")).filter(([name, value]) => name && value).map(([name, ...value]) => [name, decodeURIComponent(value.join("="))]));
}

function sessionToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return parseCookies(req).roshni_session || "";
}

function sessionCookie(token, maxAge = SESSION_DAYS * 24 * 60 * 60) {
  const flags = [`roshni_session=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (PRODUCTION_MODE || process.env.COOKIE_SECURE === "true") flags.push("Secure");
  return flags.join("; ");
}

function clearSessionCookie() {
  return sessionCookie("", 0);
}

function json(res, status, payload) {
  const headers = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
  if (payload?.__setCookie) {
    headers["Set-Cookie"] = payload.__setCookie;
    delete payload.__setCookie;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

function error(res, status, message, extra = {}) {
  json(res, status, { error: message, ...extra });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) reject(new Error("Request is too large"));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Request body must be valid JSON")); }
    });
    req.on("error", reject);
  });
}

function sessionAccount(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const tokenHash = hash(token);
  const timestamp = Date.now();
  for (const account of Object.values(database.accounts)) {
    const session = account.sessions?.find((item) => item.hash === tokenHash && item.expiresAt > timestamp);
    if (session) return account;
  }
  return null;
}

function sessionContext(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const tokenHash = hash(token);
  const timestamp = Date.now();
  for (const account of Object.values(database.accounts)) {
    const session = account.sessions?.find((item) => item.hash === tokenHash && item.expiresAt > timestamp);
    if (session) return { account, session, token };
  }
  return null;
}

function createSession(account, req = null) {
  const token = crypto.randomBytes(32).toString("base64url");
  account.sessions = (account.sessions || []).filter((item) => item.expiresAt > Date.now());
  account.sessions.push({ id: crypto.randomUUID(), hash: hash(token), createdAt: now(), lastSeenAt: now(), deviceLabel: String(req?.headers["x-device-label"] || process.env.DEFAULT_DEVICE_LABEL || "browser").slice(0, 80), userAgent: String(req?.headers["user-agent"] || "").slice(0, 240), expiresAt: Date.now() + (SESSION_DAYS * 24 * 60 * 60 * 1000) });
  saveJson(DB_FILE, database);
  syncAccountToSupabase(account);
  return token;
}

function sessionView(session, currentId) {
  return { id: session.id, deviceLabel: session.deviceLabel || "browser", userAgent: session.userAgent || "unknown browser", createdAt: session.createdAt, lastSeenAt: session.lastSeenAt || session.createdAt, expiresAt: session.expiresAt, current: session.id === currentId };
}

function requireAdmin(req, res) {
  if (!ADMIN_KEY || req.headers["x-roshni-admin-key"] !== ADMIN_KEY) {
    error(res, 403, "An administrative key is required for this route.");
    return false;
  }
  return true;
}

function secureProductionConfig() {
  return { cookieSessions: COOKIE_SESSIONS, https: Boolean(process.env.TLS_KEY_FILE && process.env.TLS_CERT_FILE), storage: process.env.ROSHNI_STORAGE_ADAPTER || "filesystem", recoveryEmailConfigured: Boolean(process.env.RECOVERY_WEBHOOK_URL) };
}

function validateCredentials(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use at least 8 characters for the account password." };
  return { email, password };
}

function createRecoveryToken(account) {
  const token = crypto.randomBytes(32).toString("base64url");
  account.recovery = { hash: hash(token), expiresAt: Date.now() + (RECOVERY_MINUTES * 60 * 1000), createdAt: now() };
  saveJson(DB_FILE, database);
  return token;
}

async function deliverRecoveryToken(account, token) {
  const webhook = process.env.RECOVERY_WEBHOOK_URL;
  if (!webhook) return false;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.RECOVERY_WEBHOOK_KEY ? { Authorization: `Bearer ${process.env.RECOVERY_WEBHOOK_KEY}` } : {}) },
    body: JSON.stringify({ email: account.email, displayName: account.displayName, token, expiresInMinutes: RECOVERY_MINUTES })
  });
  return response.ok;
}

function resetPassword(account, token, password) {
  if (!account.recovery || account.recovery.expiresAt <= Date.now() || !crypto.timingSafeEqual(Buffer.from(account.recovery.hash), Buffer.from(hash(token)))) return false;
  account.password = passwordRecord(password);
  account.recovery = null;
  account.sessions = [];
  saveJson(DB_FILE, database);
  syncAccountToSupabase(account);
  return true;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function getGoogleTranslateWiz() {
  if (googleTranslateWiz && googleTranslateWiz.expiresAt > Date.now()) return googleTranslateWiz;
  const response = await fetch("https://translate.google.com", { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw Object.assign(new Error(`Google Translate page returned ${response.status}.`), { statusCode: 502 });
  const html = await response.text();
  const start = html.indexOf("WIZ_global_data = {");
  if (start < 0) throw Object.assign(new Error("Google Translate did not expose its synthesis token."), { statusCode: 502 });
  const end = html.indexOf("</script>", start);
  const text = html.slice(start, end < 0 ? undefined : end);
  const read = (pattern) => text.match(pattern)?.[1];
  const wiz = { sid: read(/"FdrFJe":"(.*?)"/), bl: read(/"cfb2h":"(.*?)"/), at: read(/"SNlM0e":"(.*?)"/) };
  if (!wiz.sid || !wiz.bl) throw Object.assign(new Error("Google Translate synthesis tokens were incomplete."), { statusCode: 502 });
  googleTranslateWiz = { ...wiz, expiresAt: Date.now() + 60 * 60 * 1000 };
  return googleTranslateWiz;
}

async function synthesizeGoogleTranslate(body) {
  const text = String(body.text || "").trim();
  const lang = ["hi", "ur", "en"].includes(String(body.lang)) ? String(body.lang) : "hi";
  if (!text) throw Object.assign(new Error("A line of text is required."), { statusCode: 400 });
  if (text.length > 220) throw Object.assign(new Error("Google Translate reading sections must be shorter than 220 characters."), { statusCode: 413 });
  const wiz = await getGoogleTranslateWiz();
  const query = new URLSearchParams({
    rpcids: "jQ1olc",
    "f.sid": wiz.sid,
    bl: wiz.bl,
    hl: "en",
    "soc-app": "1",
    "soc-platform": "1",
    "soc-device": "1",
    _reqid: String(++googleTranslateBatchNumber * 100000 + Math.floor(1000 + Math.random() * 9000)),
    rt: "c"
  });
  const requestBody = new URLSearchParams({ "f.req": JSON.stringify([[['jQ1olc', JSON.stringify([text, lang, null]), null, "generic"]]]) });
  if (wiz.at) requestBody.set("at", wiz.at);
  const response = await fetch(`https://translate.google.com/_/TranslateWebserverUi/data/batchexecute?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "Mozilla/5.0" },
    body: requestBody.toString()
  });
  const raw = await response.text();
  if (!response.ok) throw Object.assign(new Error(`Google Translate synthesis returned ${response.status}.`), { statusCode: 502 });
  const lengthMatch = raw.match(/\d+/);
  if (!lengthMatch) throw Object.assign(new Error("Google Translate returned an unreadable audio response."), { statusCode: 502 });
  const envelopeStart = lengthMatch.index + lengthMatch[0].length;
  const envelope = JSON.parse(raw.slice(envelopeStart, envelopeStart + Number(lengthMatch[0])));
  const payload = JSON.parse(envelope?.[0]?.[2] || "null");
  if (!payload?.[0]) throw Object.assign(new Error("Google Translate returned no audio for this line."), { statusCode: 502 });
  return { audioUrl: `data:audio/mpeg;base64,${payload[0]}`, provider: "google-translate", lang };
}

function buildPoemSsml(lines, includeWordTimepoints = false) {
  return `<speak>${lines.map((line, index) => {
    const words = String(line).split(/\s+/).filter(Boolean);
    const text = includeWordTimepoints
      ? words.map((word, wordIndex) => `<mark name="word-${index}-${wordIndex}"/>${escapeXml(word)}`).join(" ")
      : escapeXml(line);
    return `<mark name="line-${index}"/>${text}${index < lines.length - 1 ? "<break time=\"350ms\"/>" : ""}`;
  }).join(" ")}</speak>`;
}

async function synthesizeCloudSpeech(body) {
  const lines = Array.isArray(body.lines) ? body.lines.map((line) => String(line).trim()).filter(Boolean) : [];
  if (!lines.length) throw Object.assign(new Error("At least one poem line is required."), { statusCode: 400 });
  const ssml = buildPoemSsml(lines, body.includeWordTimepoints === true);
  if (Buffer.byteLength(ssml, "utf8") > 5000) throw Object.assign(new Error("This poem is too long for one SSML request. Split it into shorter reading sections."), { statusCode: 413 });

  const voiceName = String(body.voiceName || "hi-IN-Neural2-A");
  const languageCode = String(body.languageCode || voiceName.slice(0, 5));
  const requestBody = {
    input: { ssml },
    voice: { languageCode, name: voiceName },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: Math.max(0.25, Math.min(4, Number(body.speakingRate) || 1)),
      pitch: Math.max(-20, Math.min(20, Number(body.pitch) || 0))
    },
    enableTimePointing: ["SSML_MARK"]
  };
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  const accessToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN;
  if (!apiKey && !accessToken) throw Object.assign(new Error("Google Cloud TTS credentials are not configured on the cloud server."), { statusCode: 503 });
  const endpoint = `https://texttospeech.googleapis.com/v1beta1/text:synthesize${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ""}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(requestBody)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || "Google Cloud TTS could not synthesize this poem."), { statusCode: response.status });
  return { audioContent: payload.audioContent, timepoints: payload.timepoints || [], ssmlBytes: Buffer.byteLength(ssml, "utf8") };
}

async function recognizePoemImage(body) {
  const imageBase64 = String(body.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!imageBase64) throw Object.assign(new Error("Choose a photograph or screenshot first."), { statusCode: 400 });
  if (Buffer.byteLength(imageBase64, "base64") > 8 * 1024 * 1024) throw Object.assign(new Error("Keep poem images under 8 MB."), { statusCode: 413 });
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Google Vision OCR credentials are not configured on the cloud server."), { statusCode: 503 });
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        image: { content: imageBase64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: Array.isArray(body.languageHints) ? body.languageHints.slice(0, 4) : ["hi", "ur", "en"] }
      }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || "Google Vision could not read this page."), { statusCode: response.status });
  const annotation = payload.responses?.[0];
  if (annotation?.error) throw Object.assign(new Error(annotation.error.message || "Google Vision could not read this page."), { statusCode: 502 });
  return {
    text: annotation?.fullTextAnnotation?.text || annotation?.textAnnotations?.[0]?.description || "",
    provider: "google-vision",
    languageHints: Array.isArray(body.languageHints) ? body.languageHints.slice(0, 4) : ["hi", "ur", "en"]
  };
}

async function handle(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      service: "roshni-cloud",
      supabase: Boolean(SUPABASE_URL && SUPABASE_KEY),
      production: secureProductionConfig()
    });
  }

  let body = {};
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    try { body = await readBody(req); } catch (err) { return error(res, 400, err.message); }
  }

  if (req.method === "POST" && url.pathname === "/api/tts/google-translate") {
    try {
      return json(res, 200, await synthesizeGoogleTranslate(body));
    } catch (err) {
      return error(res, err.statusCode || 502, err.message);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const credentials = validateCredentials(body);
    if (credentials.error) return error(res, 400, credentials.error);
    if (Object.values(database.accounts).some((account) => account.email === credentials.email)) return error(res, 409, "An account with this email already exists.");
    const id = crypto.randomUUID();
    const account = {
      id,
      email: credentials.email,
      displayName: String(body.displayName || "a quiet writer").trim().slice(0, 80),
      password: passwordRecord(credentials.password),
      sessions: [],
      revision: 0,
      updatedAt: now(),
      workspace: encryptWorkspace({ poems: [], snippets: [], dictionary: [], capsules: [], readCounts: {}, notes: {}, draft: "", poemDraft: null, settings: {} })
    };
    database.accounts[id] = account;
    const token = createSession(account, req);
    syncAccountToSupabase(account);
    return json(res, 201, { account: accountView(account), ...(COOKIE_SESSIONS ? { __setCookie: sessionCookie(token) } : { token }) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const credentials = validateCredentials(body);
    if (credentials.error) return error(res, 400, credentials.error);
    const account = Object.values(database.accounts).find((item) => item.email === credentials.email);
    if (!account || !verifyPassword(credentials.password, account.password)) return error(res, 401, "The email or password did not match.");
    const token = createSession(account, req);
    return json(res, 200, { account: accountView(account), ...(COOKIE_SESSIONS ? { __setCookie: sessionCookie(token) } : { token }) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/recovery/request") {
    const email = String(body.email || "").trim().toLowerCase();
    const account = Object.values(database.accounts).find((item) => item.email === email && !item.deletedAt);
    const response = { ok: true, message: "If an account matches, recovery instructions will be sent." };
    if (account) {
      const token = createRecoveryToken(account);
      const delivered = await deliverRecoveryToken(account, token).catch(() => false);
      if (!delivered && process.env.ALLOW_DEV_RECOVERY === "true") response.devToken = token;
    }
    return json(res, 202, response);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/recovery/reset") {
    const email = String(body.email || "").trim().toLowerCase();
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (password.length < 8 || !token) return error(res, 400, "Use a valid recovery token and an 8-character password.");
    const account = Object.values(database.accounts).find((item) => item.email === email && !item.deletedAt);
    if (!account || !resetPassword(account, token, password)) return error(res, 400, "That recovery link is invalid or has expired.");
    return json(res, 200, { ok: true, message: "Password changed. Sign in again on your devices." });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/rotate-key") {
    if (!requireAdmin(req, res)) return;
    if (process.env.ROSHNI_ENCRYPTION_KEYS) return error(res, 409, "This server uses environment-managed keys. Add the new key version to ROSHNI_ENCRYPTION_KEYS and restart instead.");
    const nextVersion = `v${Number(keyRing.activeVersion.slice(1)) + 1}`;
    keyRing.keys[nextVersion] = crypto.randomBytes(32);
    keyRing.activeVersion = nextVersion;
    for (const record of Object.values(database.accounts)) {
      if (record.workspace) record.workspace = encryptWorkspace(decryptWorkspace(record));
    }
    const keyFileValue = Object.fromEntries(Object.entries(keyRing.keys).map(([version, key]) => [version, key.toString("base64")]));
    fs.writeFileSync(path.join(DATA_DIR, "encryption.keys.json"), JSON.stringify({ activeVersion: nextVersion, keys: keyFileValue }, null, 2), "utf8");
    saveJson(DB_FILE, database);
    for (const record of Object.values(database.accounts)) syncAccountToSupabase(record);
    return json(res, 200, { ok: true, activeVersion: nextVersion });
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/admin/accounts/") && url.pathname.endsWith("/restore")) {
    if (!requireAdmin(req, res)) return;
    const accountId = decodeURIComponent(url.pathname.slice("/api/admin/accounts/".length, -"/restore".length));
    const deleted = deletedDatabase.accounts[accountId];
    if (!deleted || Number(deleted.restoreUntil || 0) < Date.now()) return error(res, 404, "That deleted cloud room is no longer restorable.");
    delete deletedDatabase.accounts[accountId];
    delete deleted.deletedAt;
    delete deleted.restoreUntil;
    database.accounts[accountId] = deleted;
    saveJson(DELETED_DB_FILE, deletedDatabase);
    saveJson(DB_FILE, database);
    syncAccountToSupabase(deleted);
    return json(res, 200, { ok: true, account: accountView(deleted) });
  }

  const context = sessionContext(req);
  const account = context?.account || null;
  if (!account) return error(res, 401, "Sign in to use the cloud room.");
  context.session.lastSeenAt = now();

  if (req.method === "POST" && url.pathname === "/api/import/ocr") {
    try {
      return json(res, 200, await recognizePoemImage(body));
    } catch (err) {
      return error(res, err.statusCode || 502, err.message);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    account.sessions = (account.sessions || []).filter((item) => item.id !== context.session.id);
    saveJson(DB_FILE, database);
    syncAccountToSupabase(account);
    return json(res, 200, { ok: true, __setCookie: clearSessionCookie() });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") return json(res, 200, { account: accountView(account) });

  if (req.method === "GET" && url.pathname === "/api/auth/sessions") {
    return json(res, 200, { sessions: (account.sessions || []).filter((session) => session.expiresAt > Date.now()).map((session) => sessionView(session, context.session.id)) });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/auth/sessions/")) {
    const sessionId = decodeURIComponent(url.pathname.slice("/api/auth/sessions/".length));
    if (sessionId === context.session.id) return error(res, 400, "Use sign out to close the current device session.");
    account.sessions = (account.sessions || []).filter((session) => session.id !== sessionId);
    saveJson(DB_FILE, database);
    syncAccountToSupabase(account);
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/workspace") {
    return json(res, 200, { workspace: decryptWorkspace(account), revision: account.revision, updatedAt: account.updatedAt });
  }

  if (req.method === "GET" && url.pathname === "/api/tts/status") {
    return json(res, 200, {
      provider: "google-cloud",
      configured: Boolean(process.env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GOOGLE_CLOUD_ACCESS_TOKEN),
      maxSsmlBytes: 5000,
      requestsPerMinute: 1000,
      neural2RequestsPerMinute: 1000,
      note: "Limits are project-level defaults; Google may change or adjust them."
    });
  }

  if (req.method === "GET" && url.pathname === "/api/security/status") {
    return json(res, 200, { ...secureProductionConfig(), keyVersion: keyRing.activeVersion, deletionRetentionDays: DELETION_RETENTION_DAYS, recoveryWindowMinutes: RECOVERY_MINUTES });
  }

  if (req.method === "PUT" && url.pathname === "/api/workspace") {
    const baseRevision = Number(body.baseRevision);
    if (!Number.isInteger(baseRevision)) return error(res, 400, "A workspace revision is required.");
    if (baseRevision !== account.revision) {
      return error(res, 409, "This workspace changed on another device.", { workspace: decryptWorkspace(account), revision: account.revision, updatedAt: account.updatedAt });
    }
    account.workspace = encryptWorkspace(body.workspace || {});
    account.revision += 1;
    account.updatedAt = now();
    saveJson(DB_FILE, database);
    syncAccountToSupabase(account);
    return json(res, 200, { revision: account.revision, updatedAt: account.updatedAt });
  }

  if (req.method === "POST" && url.pathname === "/api/tts/synthesize") {
    try {
      return json(res, 200, await synthesizeCloudSpeech(body));
    } catch (err) {
      return error(res, err.statusCode || 500, err.message);
    }
  }

  if (req.method === "DELETE" && url.pathname === "/api/account") {
    if (!String(body.password || "") || !verifyPassword(String(body.password), account.password)) return error(res, 401, "Enter your account password to delete the cloud room.");
    account.sessions = [];
    account.deletedAt = Date.now();
    account.restoreUntil = Date.now() + (DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    deletedDatabase.accounts[account.id] = { ...account };
    delete database.accounts[account.id];
    saveJson(DB_FILE, database);
    saveJson(DELETED_DB_FILE, deletedDatabase);
    syncAccountToSupabase(deletedDatabase.accounts[account.id]);
    return json(res, 200, { ok: true, restoreUntil: account.restoreUntil, __setCookie: clearSessionCookie() });
  }

  return error(res, 404, "Cloud route not found.");
}

if (PRODUCTION_MODE && (!process.env.TLS_KEY_FILE || !process.env.TLS_CERT_FILE || !COOKIE_SESSIONS || !ADMIN_KEY)) {
  throw new Error("Production mode requires TLS_KEY_FILE, TLS_CERT_FILE, COOKIE_SESSIONS=true, and ROSHNI_ADMIN_KEY.");
}

const serverFactory = process.env.TLS_KEY_FILE && process.env.TLS_CERT_FILE
  ? https.createServer({ key: fs.readFileSync(process.env.TLS_KEY_FILE), cert: fs.readFileSync(process.env.TLS_CERT_FILE) }, (req, res) => handle(req, res).catch((err) => { console.error(err); error(res, 500, "The cloud room could not complete that request."); }))
  : http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    error(res, 500, "The cloud room could not complete that request.");
  });
});

serverFactory.listen(PORT, HOST, () => {
  const protocol = process.env.TLS_KEY_FILE && process.env.TLS_CERT_FILE ? "https" : "http";
  console.log(`Roshni cloud API listening on ${protocol}://${HOST}:${PORT}`);
});
