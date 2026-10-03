const STORAGE_KEY = "roshni-aur-lafz-workspace-v1";

const emptyWorkspace = {
  poems: [],
  snippets: [],
  affirmations: [],
  dictionary: [],
  capsules: [],
  deletedPoemIds: [],
  readCounts: {},
  notes: {},
  draft: "",
  poemDraft: null,
  settings: {}
};

export function loadWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      ...emptyWorkspace,
      ...saved,
      poems: Array.isArray(saved?.poems) ? saved.poems : [],
      snippets: Array.isArray(saved?.snippets) ? saved.snippets : [],
      affirmations: Array.isArray(saved?.affirmations) ? saved.affirmations : [],
      dictionary: Array.isArray(saved?.dictionary) ? saved.dictionary : [],
      capsules: Array.isArray(saved?.capsules) ? saved.capsules : [],
      deletedPoemIds: Array.isArray(saved?.deletedPoemIds) ? saved.deletedPoemIds : [],
      readCounts: saved?.readCounts && typeof saved.readCounts === "object" ? saved.readCounts : {},
      notes: saved?.notes && typeof saved.notes === "object" ? saved.notes : {},
      poemDraft: saved?.poemDraft && typeof saved.poemDraft === "object" ? saved.poemDraft : null,
      settings: saved?.settings && typeof saved.settings === "object" ? saved.settings : {}
    };
  } catch {
    return { ...emptyWorkspace };
  }
}

export function saveWorkspace(workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  window.dispatchEvent(new CustomEvent("roshni:workspace-saved"));
}

export async function hashSecret(secret) {
  const encoded = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function downloadWorkspace(workspace) {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), ...workspace }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "roshni-aur-lafz-archive.json";
  link.click();
  URL.revokeObjectURL(url);
}
