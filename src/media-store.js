const DB_NAME = "roshni-media-v1";
const DB_VERSION = 1;
const CLOUD_AUDIO_STORE = "cloud-audio";
const RECORDING_STORE = "voice-recordings";
const CLOUD_AUDIO_LIMIT = 12;

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (!("indexedDB" in globalThis)) return Promise.resolve(null);
  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CLOUD_AUDIO_STORE)) database.createObjectStore(CLOUD_AUDIO_STORE, { keyPath: "key" });
      if (!database.objectStoreNames.contains(RECORDING_STORE)) database.createObjectStore(RECORDING_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return databasePromise;
}

function requestStore(storeName, mode, action) {
  return openDatabase().then((database) => {
    if (!database) return null;
    return new Promise((resolve) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  });
}

export async function readCloudAudio(key) {
  const record = await requestStore(CLOUD_AUDIO_STORE, "readonly", (store) => store.get(key));
  return record?.payload || null;
}

export async function writeCloudAudio(key, payload) {
  const database = await openDatabase();
  if (!database) return;
  await new Promise((resolve) => {
    const transaction = database.transaction(CLOUD_AUDIO_STORE, "readwrite");
    transaction.objectStore(CLOUD_AUDIO_STORE).put({ key, payload, createdAt: Date.now() });
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
  const records = await requestStore(CLOUD_AUDIO_STORE, "readonly", (store) => store.getAll()) || [];
  records.sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, records.length - CLOUD_AUDIO_LIMIT)).forEach((record) => {
    requestStore(CLOUD_AUDIO_STORE, "readwrite", (store) => store.delete(record.key));
  });
}

export async function readVoiceRecording(key) {
  const record = await requestStore(RECORDING_STORE, "readonly", (store) => store.get(key));
  return record?.blob || null;
}

export async function writeVoiceRecording(key, blob) {
  const database = await openDatabase();
  if (!database) return;
  await new Promise((resolve) => {
    const transaction = database.transaction(RECORDING_STORE, "readwrite");
    transaction.objectStore(RECORDING_STORE).put({ key, blob, createdAt: Date.now() });
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
  });
}

export async function deleteVoiceRecording(key) {
  await requestStore(RECORDING_STORE, "readwrite", (store) => store.delete(key));
}
