import { downloadWorkspace, hashSecret, loadWorkspace, saveWorkspace } from "./storage.js";
import { starterPoems, starterSnippets } from "./content.js";
import { canSpeak, listVoices, pauseSpeaking, resumeSpeaking, speakLines, stopSpeaking } from "./voice.js";
import { createSoundscape, SOUND_LIBRARY, SOUND_PRESETS, presetMix } from "./soundscape.js";
import { deleteCloudAccount, getCloudAccount, getCloudSecurityStatus, getCloudSession, getCloudTtsStatus, loadRemoteWorkspace, loadSessions, loginAccount, logoutAccount, recognizePoemImage, registerAccount, requestPasswordRecovery, revokeSession, saveRemoteWorkspace } from "./cloud.js";
import { loadVoiceRecording, recordingSupported, startVoiceRecording, stopVoiceRecording } from "./recording.js";
import { cleanPoemText, formatCouplets, speechRecognitionSupported, startSpeechCapture, stopSpeechCapture } from "./capture.js";
import { DECORATION_LIBRARY, STANZA_ART, decorationAsset, normalizeDecorations } from "./decorations.js";
import { TONIGHT_FEELINGS, capsuleDateLabel, capsuleIsUnlocked, createShareCard, dayKey, poemForFeeling, poemOfTheDay, yearRecap } from "./rituals.js";
import { renderMoonlitCopy, renderMoonlitScene } from "./ui/sky-scene.js?v=5";
import { mountFireflies } from "./ui/fireflies.js?v=4";

const workspace = loadWorkspace();
const deletedPoemIds = new Set(workspace.deletedPoemIds || []);
const poems = starterPoems.filter((poem) => !deletedPoemIds.has(poem.id));
workspace.poems.forEach((savedPoem) => {
  if (deletedPoemIds.has(savedPoem.id)) return;
  const existingIndex = poems.findIndex((poem) => poem.id === savedPoem.id);
  if (existingIndex >= 0) poems[existingIndex] = savedPoem;
  else poems.push(savedPoem);
});
const snippets = [...starterSnippets, ...workspace.snippets];

const state = {
  tab: "sky",
  mood: workspace.settings.mood || "all",
  filter: workspace.settings.filter || "mine",
  search: workspace.settings.search || "",
  activePoem: "window-light",
  readerMode: workspace.settings.readerMode || "scroll",
  language: workspace.settings.language || "roman",
  playing: false,
  lineIndex: 0,
  wordIndex: -1,
  locked: Boolean(workspace.settings.locked),
  soundOn: false,
  notes: workspace.notes || {},
  editingPoemId: null,
  voiceRate: Number(workspace.settings.voiceRate || 0.82),
  voicePitch: Number(workspace.settings.voicePitch || 0.95),
  voiceName: workspace.settings.voiceName || "",
  paused: false,
  voiceError: "",
  captions: [],
  captionsVisible: false,
  recordingActive: false,
  recordingPlaying: false,
  recordingUrl: "",
  recordingError: "",
  explanationRecordingActive: false,
  explanationPlaying: false,
  explanationUrl: "",
  explanationError: "",
  cloudAccount: getCloudSession()?.account || null,
  cloudRevision: getCloudSession()?.account?.revision || 0,
  cloudTtsStatus: null,
  cloudStatus: "",
  cloudBusy: false,
  cloudSessions: [],
  cloudSecurity: null,
  recoveryStatus: "",
  replyToPoemId: null,
  editorDecorations: [],
  editorImages: [],
  captureImageDataUrl: "",
  captureMode: "paste",
  captureListening: false,
  captureTranscript: "",
  decorateMode: false,
  selectedDecorationId: null,
  selectedImageId: null,
  whisperSnippetId: workspace.settings.whisperSnippetId || "",
  tonightFeeling: workspace.settings.tonightFeeling || "tender",
  ritualStatus: "",
  soundError: ""
};

let playbackTimer;
let cloudSyncTimer;
let cloudHydrating = false;
let decorationDrag = null;
let imageInteraction = null;
const soundscape = createSoundscape({
  initialMix: workspace.settings.soundMix || {},
  onChange: (mix, playing) => {
    workspace.settings.soundMix = mix;
    state.soundOn = playing;
    saveWorkspace(workspace);
    updateSoundButton();
  },
  onError: () => {
    state.soundError = "This sound could not load; choose another layer or keep the room quiet.";
    state.soundOn = false;
    updateSoundButton();
  }
});

const contentPanel = document.querySelector("#contentPanel");
const readerPanel = document.querySelector("#readerPanel");
const dialog = document.querySelector("#thoughtDialog");
const poemDialog = document.querySelector("#poemDialog");
const lockDialog = document.querySelector("#lockDialog");
const soundDialog = document.querySelector("#soundDialog");
const accountDialog = document.querySelector("#accountDialog");
const captureDialog = document.querySelector("#captureDialog");
const capsuleDialog = document.querySelector("#capsuleDialog");
const yearDialog = document.querySelector("#yearDialog");
let lockMode = "setup";

function persistSettings() {
  workspace.settings = {
    ...workspace.settings,
    mood: state.mood,
    filter: state.filter,
    search: state.search,
    readerMode: state.readerMode,
    language: state.language,
    locked: state.locked,
    voiceRate: state.voiceRate,
    voicePitch: state.voicePitch,
    voiceName: state.voiceName,
    tonightFeeling: state.tonightFeeling,
    whisperDate: workspace.settings.whisperDate,
    whisperSnippetId: state.whisperSnippetId
  };
  workspace.notes = state.notes;
  saveWorkspace(workspace);
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function searchField() {
  return `<label class="search-box"><span>⌕</span><input id="searchInput" value="${escapeAttribute(state.search)}" placeholder="search words, weather, poems" aria-label="Search your writing" /></label>`;
}

function languageToVoiceLanguage() {
  if (state.language === "devanagari") return "hi-IN";
  if (state.language === "urdu") return "ur-IN";
  return "en-IN";
}

function tagList(value) {
  return String(value || "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).filter((tag, index, tags) => tags.indexOf(tag) === index);
}

function tagMarkup(tags = []) {
  return tags.slice(0, 4).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("");
}

function voiceOptions() {
  const voices = listVoices().filter((voice) => /en|hi|ur/i.test(voice.lang));
  if (!voices.length) return `<option value="">browser voice · ${languageToVoiceLanguage()}</option>`;
  return `<option value="">automatic · ${languageToVoiceLanguage()}</option>${voices.map((voice) => `<option value="${escapeAttribute(voice.name)}" ${voice.name === state.voiceName ? "selected" : ""}>${escapeHtml(voice.label || voice.name)} · ${escapeHtml(voice.lang)}</option>`).join("")}`;
}

function voiceStatus() {
  if (state.voiceError) return state.voiceError;
  if (state.voiceName.startsWith("GoogleTranslate")) return "Google Translate audio ready";
  if (state.voiceName.includes("-Neural2-") || state.voiceName.includes("-Wavenet-")) {
    if (!state.cloudAccount) return "sign in for cloud voice";
    if (state.cloudTtsStatus && !state.cloudTtsStatus.configured) return "cloud voice needs server key";
    return "Cloud SSML voice ready";
  }
  return canSpeak() ? "browser voice fallback ready" : "voice unavailable in this browser";
}

function currentPoem() {
  return poems.find((poem) => poem.id === state.activePoem) || poems[0];
}

function currentRecordingKey() {
  return `${currentPoem().id}:${state.language}`;
}

function currentExplanationKey() {
  return `${currentPoem().id}:explanation:${state.language}`;
}

function clearRecordingUrl() {
  if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
  state.recordingUrl = "";
}

function clearExplanationUrl() {
  if (state.explanationUrl) URL.revokeObjectURL(state.explanationUrl);
  state.explanationUrl = "";
}

async function refreshVoiceRecordings() {
  clearRecordingUrl();
  clearExplanationUrl();
  const [blob, explanationBlob] = await Promise.all([loadVoiceRecording(currentRecordingKey()), loadVoiceRecording(currentExplanationKey())]);
  if (blob) state.recordingUrl = URL.createObjectURL(blob);
  if (explanationBlob) state.explanationUrl = URL.createObjectURL(explanationBlob);
  renderReader();
}

function filteredSnippets() {
  const query = state.search.trim().toLowerCase();
  return snippets.filter((snippet) => {
    const matchesMood = state.mood === "all" || snippet.mood === state.mood;
    const matchesSearch = !query || `${snippet.title} ${snippet.time} ${snippet.mood} ${(snippet.tags || []).join(" ")}`.toLowerCase().includes(query);
    return matchesMood && matchesSearch;
  });
}

function prepareDailyWhisper() {
  const today = dayKey();
  const choices = snippets.filter((snippet) => snippet.id !== "new" && snippet.title);
  if (!choices.length) return;
  if (workspace.settings.whisperDate === today && choices.some((snippet) => snippet.id === state.whisperSnippetId)) return;
  const selected = choices[Math.floor(Math.random() * choices.length)];
  state.whisperSnippetId = selected.id;
  workspace.settings.whisperDate = today;
  workspace.settings.whisperSnippetId = selected.id;
  saveWorkspace(workspace);
}

function dailyWhisperSnippet() {
  prepareDailyWhisper();
  return snippets.find((snippet) => snippet.id === state.whisperSnippetId) || snippets[0];
}

function ritualMarkup() {
  const daily = poemOfTheDay(poems);
  const tonight = poemForFeeling(poems, state.tonightFeeling);
  return `<section class="ritual-row" aria-label="Poem rituals"><article class="ritual-card poem-day-card"><p class="eyebrow">poem of the day</p><strong>${escapeHtml(daily?.title || "a page waiting")}</strong><small>today's page arrives in your handwriting.</small><button type="button" class="ritual-link" data-ritual-poem="${escapeAttribute(daily?.id || "")}">open today's poem ↗</button></article><article class="ritual-card tonight-card"><p class="eyebrow">poem for tonight</p><strong>Choose the weather.</strong><div class="tonight-picker"><label for="tonightFeeling">feeling</label><select id="tonightFeeling">${TONIGHT_FEELINGS.map((feeling) => `<option value="${feeling.id}" ${feeling.id === state.tonightFeeling ? "selected" : ""}>${escapeHtml(feeling.label)}</option>`).join("")}</select></div><small>${escapeHtml(tonight?.title || "nothing has found the right weather yet")}</small><button type="button" class="ritual-link" data-ritual-poem="${escapeAttribute(tonight?.id || "")}">open for tonight ↗</button></article></section>`;
}

function renderContent() {
  renderSkyStage();
  if (state.tab === "desk" || state.tab === "write") return renderDesk();
  if (state.tab === "shelf") return renderShelf();
  if (state.tab === "read") return renderReadView();
  renderSkyList();
}

function renderSkyStage() {
  const stage = document.querySelector("#skyStage");
  const sceneHost = document.querySelector("#skyScene");
  if (!stage || !sceneHost) return;
  const copy = renderMoonlitCopy(new Date());
  document.querySelector("#skyDateLabel").textContent = `${copy.eyebrow} · ${copy.dateLabel}`;
  document.querySelector("#skyTitle").textContent = copy.title;
  document.querySelector("#skyAccent").textContent = copy.accent;
  document.querySelector("#skyNote").textContent = copy.note;
  const count = snippets.filter((snippet) => snippet.id !== "new" && snippet.title).length;
  document.querySelector("#skyCaption").textContent = count ? `${count} thought${count === 1 ? "" : "s"} gathering above the desk` : "the first star is waiting for a line";
  sceneHost.innerHTML = renderMoonlitScene(snippets, new Date());
}

function renderSkyList() {
  const affirmations = Array.isArray(workspace.affirmations) ? workspace.affirmations : [];
  const pick = affirmations.length
    ? affirmations[Math.floor(Math.random() * affirmations.length)]
    : null;

  const affirmationBlock = pick
    ? `<div class="home-affirmation-display" aria-live="polite">
        <span class="home-affirmation-mark">✦</span>
        <blockquote class="home-affirmation-text">${escapeHtml(pick.text)}</blockquote>
       </div>`
    : `<div class="home-affirmation-display home-affirmation-empty" aria-live="polite">
        <span class="home-affirmation-mark">✦</span>
        <p class="home-affirmation-nudge">Your words will appear here.<br><button type="button" class="affirmation-nudge-link" data-tab="shelf">Write your first affirmation in the library ↗</button></p>
       </div>`;

  contentPanel.innerHTML = `
    <section class="affirmation-garden">
      ${affirmationBlock}
    </section>
    <section class="home-doors" aria-label="Continue into your writing room">
      <button class="home-door home-door-write" data-tab="write"><span class="door-kicker">make something</span><strong>Write a poem</strong><span class="door-arrow">↗</span></button>
      <button class="home-door home-door-library" data-tab="shelf"><span class="door-kicker">return to what stays</span><strong>Open the library</strong><span class="door-arrow">↗</span></button>
    </section>`;
}

function snippetCard(snippet) {
  return `<article class="snippet-slip" data-snippet-card="${snippet.id}" data-open-poem="${escapeAttribute(snippet.poemId)}" role="button" tabindex="0">
    <div class="snippet-symbol">${snippet.symbol}</div>
    <div class="snippet-copy"><strong>${escapeHtml(snippet.title)}</strong><small>${escapeHtml(snippet.time)}</small><div class="tag-row">${tagMarkup(snippet.tags)}</div></div>
    <span class="snippet-arrow" aria-hidden="true">↗</span>
  </article>`;
}

function selectedEditorPoem() {
  const poem = state.editingPoemId ? poems.find((item) => item.id === state.editingPoemId) : null;
  const draft = state.editingPoemId ? {} : (workspace.poemDraft || {});
  const lines = String(draft.lines ?? poem?.lines?.join("\n") ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return {
    ...(poem || {}),
    id: poem?.id || "editor-preview",
    title: draft.title ?? poem?.title ?? "your poem",
    owner: poem?.owner || "mine",
    mood: draft.mood ?? poem?.mood ?? "tender",
    source: draft.source ?? poem?.source ?? "written at the desk",
    tags: tagList(draft.tags ?? poem?.tags?.join(", ") ?? ""),
    lines,
    decorations: state.editorDecorations,
    images: state.editorImages
  };
}

function stickerColumnMarkup(poem) {
  const images = Array.isArray(poem.images) ? poem.images : [];
  const selectedImage = images.find((image) => image.id === state.selectedImageId);
  const imageControls = selectedImage
    ? `<div class="image-layer-controls"><p class="eyebrow">selected image</p><strong>${escapeHtml(selectedImage.name || "pasted image")}</strong><label>size <output id="imageScaleValue">${Number(selectedImage.scale || 0.5).toFixed(2)}×</output><input id="imageScaleInput" type="range" min="0.1" max="3.5" step="0.05" value="${selectedImage.scale || 0.5}" /></label><label>rotation <output id="imageRotationValue">${Math.round(selectedImage.rotation || 0)}°</output><input id="imageRotationInput" type="range" min="-180" max="180" step="1" value="${selectedImage.rotation || 0}" /></label><button type="button" class="text-button dark-text danger-action" id="removeImageButton">remove image</button></div>`
    : `<p class="image-selection-hint">Select an image on the page to move, resize, or rotate it.</p>`;
  const decorations = Array.isArray(state.editorDecorations) ? state.editorDecorations : [];
  const selDeco = decorations.find((d) => d.id === state.selectedDecorationId);
  const selDecoAsset = selDeco ? decorationAsset(selDeco.assetId) : null;
  const stickerControls = selDeco
    ? `<div class="image-layer-controls sticker-layer-controls"><p class="eyebrow">selected sticker</p><strong>${escapeHtml(selDecoAsset ? selDecoAsset.label : "sticker")}</strong><label>size <output id="editorDecoScaleValue">${Number(selDeco.scale || 1).toFixed(2)}×</output><input id="editorDecoScaleInput" type="range" min="0.25" max="3.5" step="0.05" value="${selDeco.scale || 1}" /></label><label>rotation <output id="editorDecoRotValue">${Math.round(selDeco.rotation || 0)}°</output><input id="editorDecoRotInput" type="range" min="-180" max="180" step="1" value="${selDeco.rotation || 0}" /></label><button type="button" class="text-button dark-text danger-action" id="removeDecorationButton">remove sticker</button></div>`
    : "";
  return `<aside class="sticker-column"><div class="sticker-heading"><p class="eyebrow">around the page</p><h3>Stickers &amp; images</h3><p>Click a sticker to place it, then drag on the page. Corner handles to resize or rotate.</p></div><div class="sticker-grid">${DECORATION_LIBRARY.map((asset) => `<button type="button" class="sticker-button" data-add-decoration="${escapeAttribute(asset.id)}" title="Add ${escapeAttribute(asset.label)}"><img src="${asset.src}" alt="" /><span>${escapeHtml(asset.label)}</span></button>`).join("")}</div>${stickerControls}<div class="image-actions"><label class="image-import-button">＋ import an image<input id="workspacePoemImage" type="file" accept="image/*" /></label><button type="button" class="paste-image-button" id="pasteWorkspaceImageButton">paste an image</button><div class="image-paste-target" id="workspaceImagePasteTarget" contenteditable="true" role="textbox" aria-label="Paste an image from clipboard">click here, then press Ctrl+V</div></div>${images.length ? `<div class="imported-image-list" aria-label="Imported images">${images.map((image) => `<span class="imported-image-chip ${image.id === state.selectedImageId ? "selected" : ""}">${escapeHtml(image.name || "image")}</span>`).join("")}</div>` : ""}${imageControls}</aside>`;
}
function soundChoiceMarkup() {
  const selected = new Set(Object.keys(soundscape.getMix()));
  const featured = SOUND_PRESETS.slice(0, 6);
  const options = SOUND_LIBRARY.reduce((groups, sound) => { (groups[sound.category] ||= []).push(sound); return groups; }, {});
  const optionMarkup = Object.entries(options).map(([category, sounds]) => `<optgroup label="${escapeAttribute(category)}">${sounds.map((sound) => `<option value="${escapeAttribute(sound.id)}" ${selected.has(sound.id) ? "selected" : ""}>${escapeHtml(sound.label)}</option>`).join("")}</optgroup>`).join("");
  return `<section class="sound-choice"><div class="sound-choice-heading"><div><p class="eyebrow">the air around the poem</p><h3>Choose a sound</h3><p>Let one room sit beneath the words. Change it whenever the weather changes.</p></div><div class="sound-choice-actions"><button type="button" class="voice-action" data-sound-action="toggle">${soundscape.isPlaying() ? "pause sound" : "play sound"}</button><button type="button" class="text-button dark-text" data-sound-action="stop">silence</button></div></div><div class="sound-presets sound-presets-page">${featured.map((preset) => `<button type="button" class="sound-preset ${preset.paths.some(([path]) => selected.has(path.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase())) ? "selected" : ""}" data-sound-preset="${preset.id}"><strong>${escapeHtml(preset.label)}</strong><small>${escapeHtml(preset.note)}</small></button>`).join("")}</div><label class="sound-library-select">all sounds<select data-sound-single aria-label="Choose any background sound"><option value="">choose from the full sound library</option>${optionMarkup}</select></label></section>`;
}

function renderDesk() {
  const poem = selectedEditorPoem();
  const draft = workspace.poemDraft || {};
  const isCollected = poem.owner === "collected";
  contentPanel.innerHTML = `
    <section class="poem-desk-page">
      <div class="page-back-row"><button type="button" class="back-link" data-tab="sky">← back home</button><span>${state.editingPoemId ? "returning to a page" : "a new page"}</span></div>
      <div class="desk-page-heading"><div><p class="eyebrow">the writing room</p><h1>${state.editingPoemId ? "Edit the poem." : "Begin the poem."}</h1><p>Give the thought a quiet place to become itself.</p></div><div class="desk-page-mark">✦</div></div>
      <form class="poem-workspace-form" id="poemWorkspaceForm">
        <div class="poem-editor-main">
          <label class="editor-title-field" for="workspacePoemTitle"><span>title</span><input id="workspacePoemTitle" value="${escapeAttribute(draft.title ?? (state.editingPoemId ? poem.title : ""))}" placeholder="give it a door to enter through…" /></label>
          <label class="editor-lines-field" for="workspacePoemLines"><span>lines</span><textarea id="workspacePoemLines" rows="13" placeholder="one line per breath…">${escapeHtml(draft.lines ?? (state.editingPoemId ? poem.lines.join("\n") : ""))}</textarea></label>
          <p class="editor-status" id="poemEditorStatus" aria-live="polite">Your writing stays here while you work.</p>
          <section class="editor-artboard-section"><div class="editor-artboard-heading"><div><p class="eyebrow">the page itself</p><h2>Arrange the room.</h2></div><p>Choose an image, then drag it on the page. Use the corner and round handles for quick adjustments.</p></div>${poemArtboardMarkup(poem, poem.lines, "editorPoemArtboard")}</section>
          ${soundChoiceMarkup()}
        </div>
        <aside class="poem-editor-side">
          <section class="editor-details"><p class="eyebrow">shape the weather</p><label>mood<select id="workspacePoemMood"><option value="tender" ${(draft.mood ?? poem.mood) === "tender" ? "selected" : ""}>tender</option><option value="restless" ${(draft.mood ?? poem.mood) === "restless" ? "selected" : ""}>restless</option><option value="hopeful" ${(draft.mood ?? poem.mood) === "hopeful" ? "selected" : ""}>hopeful</option></select></label><label>source<input id="workspacePoemSource" value="${escapeAttribute(draft.source ?? (state.editingPoemId ? poem.source : ""))}" placeholder="written after…" /></label><label>tags<input id="workspacePoemTags" value="${escapeAttribute(draft.tags ?? (state.editingPoemId ? (poem.tags || []).join(", ") : ""))}" placeholder="night, rain, longing" /></label><label>sharing<select id="workspacePoemSharing"><option value="private" ${(draft.sharePermission ?? poem.sharePermission) !== "shareable" ? "selected" : ""}>private · keep it here</option><option value="shareable" ${(draft.sharePermission ?? poem.sharePermission) === "shareable" ? "selected" : ""}>shareable · make a card</option></select></label>${isCollected ? `<label>poet<input id="workspacePoemPoet" value="${escapeAttribute(poem.poet || "")}" placeholder="who wrote it?" /></label><label>why it stayed<textarea id="workspacePoemWhySaved" rows="3" placeholder="what did it touch in you?">${escapeHtml(poem.whySaved || "")}</textarea></label>` : ""}</section>
          ${stickerColumnMarkup(poem)}
          <div class="editor-actions"><button type="button" class="text-button dark-text" data-tab="sky">leave it for later</button><button type="submit" class="primary-button">save poem <span>↗</span></button></div>
        </aside>
      </form>
    </section>`;
}

function renderReadView() {
  const visiblePoems = poems.filter((poem) => {
    const query = state.search.trim().toLowerCase();
    return !query || `${poem.title} ${poem.source} ${poem.poet || ""} ${(poem.tags || []).join(" ")}`.toLowerCase().includes(query);
  });
  contentPanel.innerHTML = `<div class="reading-context"><p class="eyebrow">the reading room</p><h2>Listen <em>slowly.</em></h2><p class="reading-lede">Choose a page, settle into its weather, and let the voice find the pauses.</p>${searchField()}<div class="reading-queue">${visiblePoems.map((poem) => `<button type="button" class="reading-queue-item ${poem.id === state.activePoem ? "active" : ""}" data-open-poem="${escapeAttribute(poem.id)}"><span>${poem.owner === "collected" ? "❧" : "✦"}</span><strong>${escapeHtml(poem.title)}</strong><small>${escapeHtml(poem.poet || poem.source || "your words")}</small></button>`).join("") || `<p class="snippet-empty">No page is waiting under that search.</p>`}</div></div>`;
}

function renderShelf() {
  const query = state.search.trim().toLowerCase();
  const visiblePoems = poems.filter((poem) => !query || `${poem.title} ${poem.mood} ${poem.source} ${poem.poet || ""} ${(poem.tags || []).join(" ")}`.toLowerCase().includes(query));
  const mine = visiblePoems.filter((poem) => poem.owner !== "collected");
  const collected = visiblePoems.filter((poem) => poem.owner === "collected");
  const affirmations = Array.isArray(workspace.affirmations) ? workspace.affirmations : [];
  contentPanel.innerHTML = `
    <section class="library-page"><div class="page-back-row"><button type="button" class="back-link" data-tab="sky">← back home</button><span>your private shelves</span></div><div class="library-heading"><div><p class="eyebrow">the library</p><h1>Keep what <em>stays.</em></h1><p>Three places for the poems you make, the poems you collect, and the words that carry you.</p></div>${searchField()}</div><div class="library-columns"><section class="library-column"><div class="column-heading"><h2>Mine</h2><span>${mine.length}</span></div>${mine.length ? mine.map(bookletCard).join("") : `<div class="library-empty">Your poems will live here.</div>`}<button type="button" class="column-add" data-tab="write">＋ write a poem</button></section><section class="library-column collected-column"><div class="column-heading"><h2>Collected</h2><span>${collected.length}</span></div>${collected.length ? collected.map(bookletCard).join("") : `<div class="library-empty">Save a poem that found you.</div>`}<button type="button" class="column-add" id="captureButton">＋ bring a poem</button></section><section class="library-column affirmation-column"><div class="column-heading"><h2>Affirmations</h2><span>${affirmations.length}</span></div>${affirmations.length ? affirmations.map((affirmation) => `<article class="library-affirmation"><span>✦</span><p>${escapeHtml(affirmation.text)}</p></article>`).join("") : `<div class="library-empty">The sentences you choose to believe will live here.</div>`}<form class="library-affirmation-form" id="affirmationForm"><textarea id="affirmationInput" rows="2" placeholder="I am allowed to begin again…"></textarea><button class="column-add" type="submit">＋ keep this word</button></form></section></div></section>`;
}


function captionMarkup(lines) {
  const captions = state.captions.length ? state.captions : lines.map((text, index) => ({ index, text, start: null, end: null }));
  return captions.map((caption) => `<div class="caption-row ${state.lineIndex === caption.index && state.playing ? "active" : ""}"><time>${formatCaptionTime(caption.start)}</time><span>${escapeHtml(caption.text)}</span></div>`).join("");
}

function poemDecorations(poem) {
  if (state.tab === "write") return normalizeDecorations(state.editorDecorations);
  return normalizeDecorations(poem.decorations);
}

function poemImages(poem) {
  if (state.tab === "write") return state.editorImages;
  return Array.isArray(poem.images) ? poem.images : [];
}

function stanzaArtMarkup(lines, poem) {
  const moodOffset = poem.mood === "restless" ? 2 : poem.mood === "tender" ? 1 : 0;
  return Array.from({ length: Math.ceil(lines.length / 2) }, (_, index) => {
    const asset = decorationAsset(STANZA_ART[(index + moodOffset) % STANZA_ART.length]);
    const active = state.playing && state.lineIndex >= index * 2 && state.lineIndex < index * 2 + 2;
    return `<div class="stanza-visual stanza-visual-${index % 4} ${active ? "active" : ""}" data-stanza-visual="${index}"><img src="${asset.src}" alt="" /><span>${String(index + 1).padStart(2, "0")}</span></div>`;
  }).join("");
}

function decorationToolsMarkup(poem) {
  const decorations = poemDecorations(poem);
  const selected = decorations.find((item) => item.id === state.selectedDecorationId);
  const selectedAsset = selected ? decorationAsset(selected.assetId) : null;
  return `<div class="decorate-tools"><div class="decorate-heading"><div><p class="eyebrow">the scrapbook table</p><strong>Place the feeling around the lines.</strong><small>Drag a piece, then tune its scale, tilt, or layer.</small></div><button type="button" class="text-button dark-text" id="finishDecoratingButton">done</button></div><div class="asset-palette" aria-label="Scrapbook assets">${DECORATION_LIBRARY.map((asset) => `<button type="button" class="asset-button" data-add-decoration="${asset.id}" title="Add ${escapeAttribute(asset.label)}"><img src="${asset.src}" alt="" /><span>${escapeHtml(asset.label)}</span></button>`).join("")}</div>${selected ? `<div class="decorate-controls"><span class="selected-asset">${escapeHtml(selectedAsset.label)} selected</span><label>scale <output id="decorationScaleValue">${selected.scale.toFixed(2)}×</output><input id="decorationScaleInput" type="range" min="0.45" max="2.2" step="0.05" value="${selected.scale}" /></label><label>tilt <output id="decorationRotationValue">${selected.rotation}°</output><input id="decorationRotationInput" type="range" min="-35" max="35" step="1" value="${selected.rotation}" /></label><button type="button" class="voice-action" data-decoration-layer="back">send back</button><button type="button" class="voice-action" data-decoration-layer="front">bring front</button><button type="button" class="voice-action danger-action" id="removeDecorationButton">remove</button></div>` : `<p class="decorate-empty">Choose a piece to begin. You can always come back and rearrange the page.</p>`}</div>`;
}

function scrapbookMarkup(poem) {
  return poemDecorations(poem).map((item) => {
    const asset = decorationAsset(item.assetId);
    const selected = state.selectedDecorationId === item.id;
    const inEditor = state.tab === "write";
    const handles = (selected && inEditor) ? `<span class="deco-handle deco-resize-handle" data-deco-resize="${escapeAttribute(item.id)}" aria-hidden="true"></span><span class="deco-handle deco-rotate-handle" data-deco-rotate="${escapeAttribute(item.id)}" aria-hidden="true"></span>` : "";
    return `<button type="button" class="decoration-item ${selected ? "selected" : ""}" data-decoration-id="${escapeAttribute(item.id)}" aria-label="${escapeAttribute(asset.label)} decoration" aria-pressed="${selected}" style="left:${item.x}%;top:${item.y}%;z-index:${item.z};transform:translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})"><img src="${asset.src}" alt="" />${handles}</button>`;
  }).join("");
}

function imageMarkup(poem) {
  const editable = state.tab === "write";
  return poemImages(poem).map((image) => {
    const selected = editable && image.id === state.selectedImageId;
    const style = `left:${image.x}%;top:${image.y}%;z-index:${image.z || 20};transform:translate(-50%, -50%) rotate(${image.rotation || 0}deg) scale(${image.scale || 0.5})`;
    if (!editable) return `<img class="poem-imported-image" src="${escapeAttribute(image.dataUrl)}" alt="${escapeAttribute(image.name || "Imported image")}" style="${style}" />`;
    return `<button type="button" class="poem-imported-image ${selected ? "selected" : ""}" data-image-id="${escapeAttribute(image.id)}" aria-label="Select ${escapeAttribute(image.name || "pasted image")}" style="${style}"><img src="${escapeAttribute(image.dataUrl)}" alt="" />${selected ? `<span class="image-handle image-resize-handle" data-image-resize="${escapeAttribute(image.id)}" aria-hidden="true"></span><span class="image-handle image-rotate-handle" data-image-rotate="${escapeAttribute(image.id)}" aria-hidden="true"></span>` : ""}</button>`;
  }).join("");
}

function poemArtboardMarkup(poem, lines, id = "poemArtboard") {
  return `<div class="poem-artboard ${state.decorateMode ? "decorate-active" : ""}" id="${id}"><div class="stanza-art" aria-hidden="true">${stanzaArtMarkup(lines, poem)}</div><div class="poem-body">${poemBodyMarkup(lines)}</div><div class="scrapbook-layer" aria-label="Poem decorations">${scrapbookMarkup(poem)}${imageMarkup(poem)}</div></div>`;
}

function poemBodyMarkup(lines) {
  const stanzas = [];
  for (let start = 0; start < lines.length; start += 2) {
    const stanzaLines = lines.slice(start, start + 2).map((line, offset) => {
      const index = start + offset;
      const words = String(line).split(/\s+/).filter(Boolean);
      const wordMarkup = words.length ? words.map((word, wordIndex) => `<span class="poem-word ${state.playing && state.lineIndex === index && state.wordIndex === wordIndex ? "current-word" : ""}">${escapeHtml(word)}</span>`).join(" ") : "&nbsp;";
      return `<span class="poem-line ${state.language === "urdu" ? "urdu" : state.language === "devanagari" ? "devanagari" : ""} ${state.playing && state.lineIndex === index ? "current" : ""}">${wordMarkup}</span>`;
    }).join("");
    const active = state.playing && state.lineIndex >= start && state.lineIndex < start + 2;
    stanzas.push(`<section class="poem-stanza ${active ? "active" : ""}" data-stanza="${start / 2}">${stanzaLines}</section>`);
  }
  return stanzas.join("");
}

function poemLayersMarkup(poem, lines) {
  const rhyme = analyzeRhyme(lines);
  const glossary = glossaryForPoem(poem, workspace.dictionary || []);
  const seeds = seedsForPoem(poem.id, snippets);
  const replies = poems.filter((item) => item.replyTo === poem.id);
  const poetMarkup = poem.poet ? `<button type="button" class="poet-link" data-poet="${escapeAttribute(poem.poet)}">${escapeHtml(poem.poet)}</button>` : "your own words";
  const rhymeRows = rhyme.endings.map((ending) => `<div class="rhyme-row"><span>${String(ending.index + 1).padStart(2, "0")}</span><strong class="${rhyme.colorByIndex.has(ending.index) ? `rhyme-${rhyme.colorByIndex.get(ending.index)}` : ""}">${escapeHtml(ending.word || "—")}</strong></div>`).join("");
  const glossaryRows = glossary.length ? glossary.map((entry) => `<div class="word-entry"><strong>${escapeHtml(entry.word)}</strong><span>${escapeHtml(entry.meaning)}</span><small>${escapeHtml(entry.language || "word")}</small></div>`).join("") : `<p class="layer-empty">Keep a word here when a poem gives you one.</p>`;
  const seedRows = seeds.length ? seeds.map((seed) => `<div class="seed-row"><span class="seed-symbol">${escapeHtml(seed.symbol)}</span><div><strong>${escapeHtml(seed.title)}</strong><small>${escapeHtml(seed.time)}</small></div></div>`).join("") : `<p class="layer-empty">No star has grown into this poem yet.</p>`;
  const replyRows = replies.length ? replies.map((reply) => `<button type="button" class="reply-row" data-open-poem="${escapeAttribute(reply.id)}"><strong>${escapeHtml(reply.title)}</strong><small>${escapeHtml(reply.date)}</small></button>`).join("") : `<p class="layer-empty">Write the first answer to this poem.</p>`;
  return `<section class="poem-layers"><details class="layer-panel"><summary>rhyme painter <small>${rhyme.radif ? `radif · ${escapeHtml(rhyme.radif)}` : "listen for the echoes"}</small></summary><div class="rhyme-painter"><div class="rhyme-legend"><span class="rhyme-marigold">marigold</span><span class="rhyme-rose">rose</span><span class="rhyme-moss">moss</span><span class="rhyme-rain">rain</span></div>${rhymeRows}</div></details><details class="layer-panel"><summary>word shelf <small>${glossary.length} words</small></summary><div class="word-shelf">${glossaryRows}</div><button type="button" class="layer-action" id="addDictionaryButton">＋ keep a word</button></details><details class="layer-panel"><summary>seed constellation <small>${seeds.length} stars</small></summary><div class="seed-list">${seedRows}</div></details><details class="layer-panel"><summary>jawab <small>${replies.length} replies</small></summary><p class="layer-attribution">answer this poem in your own weather.</p><div class="reply-list">${replyRows}</div><button type="button" class="layer-action" data-write-jawab="${escapeAttribute(poem.id)}">＋ write a jawab</button></details><div class="layer-attribution">${poem.owner === "collected" ? `collected from ${poetMarkup} · ${escapeHtml(poem.source)}<br /><em>${escapeHtml(poem.whySaved || "Saved because it stayed with you.")}</em>` : `a poem by you · ${escapeHtml(poem.source)}`}</div></section>`;
}

function bookletCard(poem) {
  const poet = poem.owner === "collected" ? escapeHtml(poem.poet || "unknown poet") : "your words";
  return `<article class="library-poem"><div class="library-poem-mark">${poem.owner === "collected" ? "❧" : "✦"}</div><div class="library-poem-copy"><p class="eyebrow">${poem.owner === "collected" ? "collected" : "mine"}</p><h3>${escapeHtml(poem.title)}</h3><p>${poet}</p><div class="tag-row booklet-tags">${tagMarkup(poem.tags)}</div></div><div class="library-poem-actions"><button type="button" data-open-poem="${escapeAttribute(poem.id)}">read</button><button type="button" data-edit-poem="${escapeAttribute(poem.id)}">edit</button><button type="button" class="delete-poem-button" data-delete-poem="${escapeAttribute(poem.id)}" aria-label="Delete ${escapeAttribute(poem.title)}">×</button></div></article>`;
}

function renderReader() {
  const poem = currentPoem();
  const key = state.language === "roman" ? "lines" : state.language === "devanagari" ? "devanagari" : "urdu";
  const lines = poem[key] || poem.lines;
  readerPanel.className = "reader-panel";
  const poemOptions = poems.map((item) => `<option value="${escapeAttribute(item.id)}" ${item.id === poem.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("");
  readerPanel.innerHTML = `
    <div class="reader-meta"><div><p class="eyebrow">${poem.owner === "collected" ? "collected / same voice, different life" : "from mine"}</p><h2>${escapeHtml(poem.title)}</h2><small>${escapeHtml(poem.date)} · ${escapeHtml(poem.source)}${poem.poet ? ` · <button type="button" class="poet-link" data-poet="${escapeAttribute(poem.poet)}">${escapeHtml(poem.poet)}</button>` : ""}</small><div class="tag-row reader-tags">${tagMarkup(poem.tags)}</div></div><div class="reader-mark">${poem.owner === "collected" ? "❧" : "✦"}</div></div>
    <div class="reader-nav"><label>choose poem<select id="readPoemSelect" aria-label="Choose a poem">${poemOptions}</select></label><button type="button" class="secondary-button dark-secondary" id="nextPoemButton">next poem ↗</button></div>
    <div class="reader-tools"><button class="read-button" id="readButton" aria-label="${state.playing ? "Pause reading" : "Read poem aloud"}">${state.playing ? "Ⅱ" : "▶"}</button></div>
    <div class="script-tabs"><button class="script-button ${state.language === "roman" ? "active" : ""}" data-language="roman">roman</button><button class="script-button ${state.language === "devanagari" ? "active" : ""}" data-language="devanagari">देवनागरी</button><button class="script-button ${state.language === "urdu" ? "active" : ""}" data-language="urdu">اردو</button></div>
    <section class="voice-panel"><div class="voice-heading"><strong>voice</strong><small>${voiceStatus()}</small></div><div class="voice-grid reader-voice-grid"><label>voice<select id="voiceSelect">${voiceOptions()}</select></label><label>speed <output id="rateValue">${state.voiceRate.toFixed(2)}×</output><input id="rateInput" type="range" min="0.5" max="2" step="0.05" value="${Math.min(2, state.voiceRate)}" /></label><div class="voice-actions"><button class="voice-action" id="pauseButton">${state.paused ? "resume" : "pause"}</button><button class="voice-action" id="stopButton">stop</button></div></div></section>
    ${state.ritualStatus ? `<p class="ritual-status">${escapeHtml(state.ritualStatus)}</p>` : ""}
    ${state.decorateMode ? decorationToolsMarkup(poem) : ""}
    ${state.recordingError || state.explanationError ? `<p class="recording-status error">${escapeHtml(state.recordingError || state.explanationError)}</p>` : state.recordingUrl || state.explanationUrl ? `<p class="recording-status">private voice notes saved on this device</p>` : ""}
    ${state.captionsVisible ? `<div class="caption-panel" aria-label="Poem captions">${captionMarkup(lines)}</div>` : ""}
    <div class="reading-stage">${poemArtboardMarkup(poem, lines)}</div>
    ${soundChoiceMarkup()}
    <div class="reader-footer"><div><button type="button" class="back-link" data-tab="shelf">← back to library</button></div><div class="reader-actions"><button class="edit-poem-button" id="editPoemButton">✎ edit poem</button></div></div>`;
}

function openPoemEditor(poemId = null, replyTo = null) {
  state.editingPoemId = poemId;
  state.replyToPoemId = replyTo;
  const poem = poemId ? poems.find((item) => item.id === poemId) : null;
  state.editorDecorations = normalizeDecorations(poem?.decorations);
  state.editorImages = Array.isArray(poem?.images) ? poem.images : Array.isArray(workspace.poemDraft?.images) ? workspace.poemDraft.images : [];
  state.selectedImageId = null;
  if (!poemId && !workspace.poemDraft) workspace.poemDraft = { title: "", mood: "tender", source: "", tags: "", sharePermission: "private", lines: "", images: [] };
  setTab("write");
  window.setTimeout(() => document.querySelector("#workspacePoemTitle")?.focus(), 80);
}

function persistEditorImages() {
  if (state.editingPoemId) {
    const poem = poems.find((item) => item.id === state.editingPoemId);
    if (poem) {
      poem.images = state.editorImages;
      persistPoem(poem);
    }
    return;
  }
  workspace.poemDraft = { ...(workspace.poemDraft || {}), images: state.editorImages };
  saveWorkspace(workspace);
}

function createEditorImage(dataUrl, name = "pasted image") {
  const image = { id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, dataUrl, x: 76, y: 22 + ((state.editorImages.length % 4) * 15), scale: 0.46, rotation: 0, z: 20 + state.editorImages.length };
  state.editorImages = [...state.editorImages, image];
  state.selectedImageId = image.id;
  persistEditorImages();
  renderContent();
}

async function addEditorImageFile(file) {
  if (!file?.type?.startsWith("image/")) return false;
  try {
    createEditorImage(await fileAsDataUrl(file), file.name || "pasted image");
    return true;
  } catch (error) {
    const status = document.querySelector("#poemEditorStatus");
    if (status) status.textContent = error.message;
    return false;
  }
}

async function pasteImageFromClipboard(targetId) {
  try {
    if (navigator.clipboard?.read) {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          if (targetId === "workspaceImagePasteTarget") await addEditorImageFile(blob);
          else await setCaptureImage(blob);
          return;
        }
      }
    }
  } catch {
    // Browsers may require the keyboard paste fallback even after a button click.
  }
  document.querySelector(`#${targetId}`)?.focus();
  if (targetId === "workspaceImagePasteTarget") {
    const status = document.querySelector("#poemEditorStatus");
    if (status) status.textContent = "The paste spot is ready. Press Ctrl+V to place the image.";
  } else setCaptureStatus("The paste spot is ready. Press Ctrl+V to add the page image.");
}

async function handleImageImport(input) {
  const file = input.files?.[0];
  if (!file) return;
  await addEditorImageFile(file);
}

function deletePoem(poemId) {
  const index = poems.findIndex((poem) => poem.id === poemId);
  if (index < 0) return;
  const poem = poems[index];
  if (!window.confirm(`Delete “${poem.title}”?`)) return;
  poems.splice(index, 1);
  workspace.poems = workspace.poems.filter((item) => item.id !== poemId);
  workspace.deletedPoemIds = Array.isArray(workspace.deletedPoemIds) ? workspace.deletedPoemIds : [];
  if (!workspace.deletedPoemIds.includes(poemId)) workspace.deletedPoemIds.push(poemId);
  saveWorkspace(workspace);
  if (state.activePoem === poemId) state.activePoem = poems[0]?.id || "";
  state.tab = "shelf";
  syncShellView();
  renderContent();
  renderReader();
}

function setCaptureStatus(message, tone = "") {
  const status = document.querySelector("#captureStatus");
  if (!status) return;
  status.textContent = message;
  status.className = `capture-status ${tone}`.trim();
}

function updateCaptureMode() {
  document.querySelectorAll("[data-capture-mode]").forEach((button) => button.classList.toggle("active", button.dataset.captureMode === state.captureMode));
  document.querySelectorAll("[data-capture-panel]").forEach((panel) => { panel.hidden = panel.dataset.capturePanel !== state.captureMode; });
}

function openCaptureDialog() {
  state.captureMode = "paste";
  state.captureListening = false;
  state.captureTranscript = "";
  document.querySelector("#captureInput").value = "";
  document.querySelector("#capturePreview").value = "";
  document.querySelector("#captureImage").value = "";
  state.captureImageDataUrl = "";
  document.querySelector("#captureImagePreview").innerHTML = "";
  updateCaptureMode();
  setCaptureStatus("paste, speak, or photograph a page.");
  captureDialog.showModal();
  document.querySelector("#captureInput").focus();
}

function formatCaptureDraft() {
  const input = document.querySelector("#captureInput");
  const preview = document.querySelector("#capturePreview");
  const formatted = formatCouplets(input.value);
  preview.value = formatted;
  const lineCount = formatted.split("\n").filter(Boolean).length;
  setCaptureStatus(lineCount ? `${lineCount} lines · couplets spaced for editing.` : "There is nothing to shape yet.", lineCount ? "ready" : "error");
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The page image could not be opened."));
    reader.readAsDataURL(file);
  });
}

async function setCaptureImage(file) {
  try {
    state.captureImageDataUrl = await fileAsDataUrl(file);
    const preview = document.querySelector("#captureImagePreview");
    if (preview) preview.innerHTML = `<img src="${escapeAttribute(state.captureImageDataUrl)}" alt="Selected poem page" />`;
    setCaptureStatus("Page image ready · choose read the page to extract its lines.", "ready");
  } catch (error) {
    setCaptureStatus(error.message, "error");
  }
}

async function readCaptureImage() {
  const input = document.querySelector("#captureImage");
  const file = input.files?.[0];
  if (!file && !state.captureImageDataUrl) {
    setCaptureStatus("Choose a photograph or screenshot first.", "error");
    return;
  }
  if (!state.cloudAccount) {
    setCaptureStatus("Sign in to the cloud room for photo reading. Paste and voice remain available here.", "error");
    return;
  }
  setCaptureStatus("reading the page slowly…");
  try {
    const imageBase64 = state.captureImageDataUrl || await fileAsDataUrl(file);
    const result = await recognizePoemImage({ imageBase64, languageHints: [document.querySelector("#captureOcrLanguage").value] });
    const formatted = formatCouplets(result.text);
    document.querySelector("#capturePreview").value = formatted;
    setCaptureStatus(formatted ? "OCR draft ready · correct every line before saving." : "The page did not yield readable text.", formatted ? "ready" : "error");
  } catch (error) {
    setCaptureStatus(error.message, "error");
  }
}

function toggleSpeechCapture() {
  const button = document.querySelector("#captureSpeechButton");
  if (state.captureListening) {
    stopSpeechCapture();
    state.captureListening = false;
    button.textContent = "speak another draft";
    setCaptureStatus("draft paused · you can keep editing it below.", "ready");
    return;
  }
  if (!speechRecognitionSupported()) {
    setCaptureStatus("Speech-to-text is not available in this browser. Paste a draft instead.", "error");
    return;
  }
  state.captureTranscript = "";
  const started = startSpeechCapture({
    lang: document.querySelector("#captureVoiceLanguage").value,
    onStart: () => {
      state.captureListening = true;
      button.textContent = "stop listening";
      setCaptureStatus("listening for the next line…");
    },
    onText: (transcript, interim) => {
      if (!interim) state.captureTranscript = `${state.captureTranscript} ${transcript}`.trim();
      const visible = `${state.captureTranscript}${interim ? ` ${transcript}` : ""}`.trim();
      document.querySelector("#captureInput").value = visible;
      document.querySelector("#capturePreview").value = cleanPoemText(visible);
      setCaptureStatus(interim ? "listening…" : "draft received · keep speaking or edit below.");
    },
    onEnd: () => {
      state.captureListening = false;
      button.textContent = "speak another draft";
      setCaptureStatus("draft paused · you can keep editing it below.", "ready");
    },
    onError: (error) => {
      state.captureListening = false;
      button.textContent = "speak a draft";
      setCaptureStatus(error.message, "error");
    }
  });
  if (!started) state.captureListening = false;
}

function useCaptureDraft() {
  const preview = document.querySelector("#capturePreview");
  const input = document.querySelector("#captureInput");
  const lines = cleanPoemText(preview.value || input.value);
  if (!lines) {
    setCaptureStatus("Give the poem a few lines first.", "error");
    return;
  }
  workspace.poemDraft = {
    title: "",
    mood: "tender",
    source: state.captureMode === "photo" ? "imported from a photograph" : state.captureMode === "voice" ? "voice draft" : "paste cleanup",
    tags: "",
    lines,
    images: state.captureImageDataUrl ? [{ id: `image-${Date.now()}`, name: "captured poem page", dataUrl: state.captureImageDataUrl, x: 78, y: 22, scale: 0.46, rotation: 0, z: 20 }] : []
  };
  saveWorkspace(workspace);
  captureDialog.close();
  openPoemEditor();
}

function saveCaptureThought() {
  const text = cleanPoemText(document.querySelector("#capturePreview").value || document.querySelector("#captureInput").value);
  if (!text) {
    setCaptureStatus("Speak a thought first, then keep it here.", "error");
    return;
  }
  const title = text.split("\n").find(Boolean)?.slice(0, 78) || "a thought waiting to be named";
  const snippet = { id: `voice-${Date.now()}`, title, time: "just now · tender", mood: "tender", tags: ["voice draft"], symbol: "✦", poemId: "window-light", x: 0.5, y: 0.5, userCreated: true };
  snippets.push(snippet);
  workspace.snippets.push(snippet);
  saveWorkspace(workspace);
  queueCloudSync();
  captureDialog.close();
  state.tab = "sky";
  syncShellView();
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === "sky"));
  renderContent();
}

function currentPoemDraft() {
  const field = (workspaceId, legacyId) => document.querySelector(`#${workspaceId}`)?.value ?? document.querySelector(`#${legacyId}`)?.value ?? "";
  return {
    title: field("workspacePoemTitle", "poemTitle"),
    mood: field("workspacePoemMood", "poemMood"),
    source: field("workspacePoemSource", "poemSource"),
    tags: field("workspacePoemTags", "poemTags"),
    sharePermission: field("workspacePoemSharing", "poemSharing"),
    lines: field("workspacePoemLines", "poemLines"),
    images: state.editorImages
  };
}

function savePoemDecorations(poem, decorations) {
  poem.decorations = normalizeDecorations(decorations);
  if (state.tab === "write" && !state.editingPoemId) state.editorDecorations = poem.decorations;
  persistPoem(poem);
  queueCloudSync();
}

function addDecoration(assetId) {
  const poem = currentPoem();
  const decorations = poemDecorations(poem);
  const asset = decorationAsset(assetId);
  const item = {
    id: `decoration-${Date.now()}`,
    assetId: asset.id,
    x: 16 + ((decorations.length * 17) % 68),
    y: asset.kind === "wash" ? 78 : 18 + ((decorations.length * 13) % 62),
    scale: asset.kind === "wash" ? 1.25 : asset.kind === "tape" ? 0.9 : 0.72,
    rotation: decorations.length % 2 ? -5 : 4,
    z: decorations.length
  };
  decorations.push(item);
  state.selectedDecorationId = item.id;
  if (state.tab === "write") {
    // In the editor, always update the editor decoration state and re-render the desk
    state.editorDecorations = decorations;
    renderContent();
  } else {
    savePoemDecorations(poem, decorations);
    renderReader();
  }
}

function selectedDecoration() {
  const poem = currentPoem();
  const decorations = poemDecorations(poem);
  return { poem, decorations, item: decorations.find((entry) => entry.id === state.selectedDecorationId) };
}

function updateSelectedDecoration(property, value) {
  const selected = selectedDecoration();
  if (!selected.item) return;
  selected.item[property] = Number(value);
  savePoemDecorations(selected.poem, selected.decorations);
  const node = document.querySelector(`[data-decoration-id="${CSS.escape(selected.item.id)}"]`);
  if (node) node.style.transform = `translate(-50%, -50%) rotate(${selected.item.rotation}deg) scale(${selected.item.scale})`;
  const scaleOutput = document.querySelector("#decorationScaleValue");
  const rotationOutput = document.querySelector("#decorationRotationValue");
  if (scaleOutput) scaleOutput.textContent = `${selected.item.scale.toFixed(2)}×`;
  if (rotationOutput) rotationOutput.textContent = `${selected.item.rotation}°`;
}

function removeSelectedDecoration() {
  const selected = selectedDecoration();
  if (!selected.item) return;
  if (state.tab === "write") {
    state.editorDecorations = selected.decorations.filter((item) => item.id !== selected.item.id);
  } else {
    savePoemDecorations(selected.poem, selected.decorations.filter((item) => item.id !== selected.item.id));
  }
  state.selectedDecorationId = null;
  if (state.tab === "write") renderContent(); else renderReader();
}

function moveSelectedDecorationLayer(direction) {
  const selected = selectedDecoration();
  if (!selected.item) return;
  const zValues = selected.decorations.map((item) => item.z);
  selected.item.z = direction === "front" ? Math.max(...zValues, 0) + 1 : Math.min(...zValues, 0) - 1;
  if (state.tab === "write") {
    state.editorDecorations = selected.decorations;
    renderContent();
  } else {
    savePoemDecorations(selected.poem, selected.decorations);
    renderReader();
  }
}

function persistPoem(poem) {
  const index = workspace.poems.findIndex((item) => item.id === poem.id);
  if (index >= 0) workspace.poems[index] = poem;
  else workspace.poems.push(poem);
  saveWorkspace(workspace);
}

function recordPoemRead(poemId) {
  workspace.readCounts = workspace.readCounts || {};
  workspace.readCounts[poemId] = Number(workspace.readCounts[poemId] || 0) + 1;
  saveWorkspace(workspace);
}

function renderCapsuleNote() {
  const title = document.querySelector("#capsuleTitle");
  const summary = document.querySelector("#capsuleSummary");
  if (!title || !summary) return;
  const capsules = Array.isArray(workspace.capsules) ? workspace.capsules : [];
  const unlocked = capsules.filter((capsule) => capsuleIsUnlocked(capsule));
  const locked = capsules.filter((capsule) => !capsuleIsUnlocked(capsule)).sort((a, b) => a.unlockAt - b.unlockAt);
  title.textContent = unlocked.length ? `${unlocked.length} page${unlocked.length > 1 ? "s" : ""} returned` : locked.length ? `sealed until ${capsuleDateLabel(locked[0].unlockAt)}` : "time capsule";
  summary.textContent = unlocked.length ? "something from later is waiting" : locked.length ? `${locked.length} page${locked.length > 1 ? "s" : ""} sleeping softly` : "seal a page for later";
}

function renderCapsuleList() {
  const panel = document.querySelector("#capsuleList");
  if (!panel) return;
  const capsules = Array.isArray(workspace.capsules) ? [...workspace.capsules].sort((a, b) => a.unlockAt - b.unlockAt) : [];
  panel.innerHTML = capsules.length ? capsules.map((capsule) => capsuleIsUnlocked(capsule)
    ? `<article class="capsule-entry unlocked"><p class="eyebrow">opened ${escapeHtml(capsuleDateLabel(capsule.unlockAt))}</p><p>${escapeHtml(capsule.message)}</p><small>you left this here for yourself.</small></article>`
    : `<article class="capsule-entry locked"><p class="eyebrow">sealed until ${escapeHtml(capsuleDateLabel(capsule.unlockAt))}</p><strong>the words are still sleeping.</strong><small>come back when the date has arrived.</small></article>`).join("") : `<p class="capsule-empty">No page has been sealed yet.</p>`;
}

function openCapsuleDialog() {
  renderCapsuleList();
  const dateInput = document.querySelector("#capsuleDate");
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  dateInput.min = tomorrow.toISOString().slice(0, 10);
  dateInput.value = "";
  document.querySelector("#capsuleMessage").value = "";
  capsuleDialog.showModal();
}

function yearRecapMarkup() {
  const recap = yearRecap(poems, snippets, workspace.readCounts || {});
  const moods = Object.entries(recap.moodCounts).sort((a, b) => b[1] - a[1]);
  const highest = Math.max(...moods.map(([, count]) => count), 1);
  const moodRows = moods.length ? moods.map(([mood, count]) => `<div class="year-mood-row"><span>${escapeHtml(mood)}</span><i style="width:${Math.round((count / highest) * 100)}%"></i><small>${count}</small></div>`).join("") : `<p class="year-empty">The year is still gathering its first lines.</p>`;
  return `<div class="year-heading"><h2>${recap.year}, in your <em>weather</em></h2><p>A small hand-drawn account of what found its way onto paper.</p></div><div class="year-illustration"><span class="year-sun">✦</span><span class="year-line line-one"></span><span class="year-line line-two"></span><span class="year-leaf">⌁</span></div><div class="year-stats"><div><strong>${recap.poemsWritten}</strong><small>poems written</small></div><div><strong>${recap.snippets}</strong><small>small signals</small></div><div><strong>${recap.totalWords}</strong><small>words carried</small></div></div><div class="year-columns"><section><p class="eyebrow">the weather of it</p>${moodRows}</section><section><p class="eyebrow">what stayed</p><p class="year-feature">${escapeHtml(recap.mostRead?.title || "a page waiting")}</p><small>${recap.mostReadCount ? `read ${recap.mostReadCount} times` : "the page you returned to most"}</small><p class="year-feature poet-feature">${escapeHtml(recap.topPoet)}</p><small>${recap.topPoetCount ? `${recap.topPoetCount} collected poem${recap.topPoetCount > 1 ? "s" : ""}` : "the voices you keep near"}</small></section></div>`;
}

function openYearDialog() {
  document.querySelector("#yearPanel").innerHTML = yearRecapMarkup();
  yearDialog.showModal();
}

function downloadShareCard() {
  const poem = currentPoem();
  if (poem.sharePermission !== "shareable") {
    state.ritualStatus = "This poem is private. Choose shareable in edit poem before making a card.";
    renderReader();
    return;
  }
  const key = state.language === "roman" ? "lines" : state.language === "devanagari" ? "devanagari" : "urdu";
  const lines = poem[key] || poem.lines;
  const dataUrl = createShareCard(poem, lines, { footer: poem.poet ? `collected from ${poem.poet}` : "a line worth carrying home" });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${poem.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "poem"}-card.png`;
  link.click();
  state.ritualStatus = "share card made · it is ready in your downloads.";
  renderReader();
}

function addDictionaryEntry() {
  const word = window.prompt("Keep a word from this poem");
  if (!word?.trim()) return;
  const meaning = window.prompt(`What does “${word.trim()}” mean to you?`);
  if (!meaning?.trim()) return;
  workspace.dictionary = Array.isArray(workspace.dictionary) ? workspace.dictionary : [];
  workspace.dictionary.push({ id: `word-${Date.now()}`, word: word.trim(), meaning: meaning.trim(), language: state.language, poemId: currentPoem().id });
  saveWorkspace(workspace);
  queueCloudSync();
  renderReader();
}

function updateLockButton() {
  const button = document.querySelector("#lockToggle");
  button.setAttribute("aria-pressed", String(state.locked));
  button.innerHTML = `<span>${state.locked ? "●" : "◌"}</span> ${state.locked ? "private on" : "private"}`;
}

function configureLockDialog(mode) {
  lockMode = mode;
  const setup = mode === "setup";
  document.querySelector("#lockEyebrow").textContent = setup ? "private room" : "the room is closed";
  document.querySelector("#lockTitle").textContent = setup ? "Set your room key" : "Come back in quietly";
  document.querySelector("#lockCopy").textContent = setup ? "This local lock protects the room on this browser. Your key is never shown back to you." : "Enter the key you chose for this browser to reopen your poems.";
  document.querySelector("#lockConfirmField").hidden = !setup;
  document.querySelector("#lockSubmit").innerHTML = `${setup ? "set key" : "unlock room"} <span>↗</span>`;
  document.querySelector("#lockPin").value = "";
  document.querySelector("#lockPinConfirm").value = "";
  lockDialog.showModal();
  document.querySelector("#lockPin").focus();
}

function updateAccountButton() {
  const button = document.querySelector("#accountButton");
  if (!button) return;
  button.innerHTML = `<span>${state.cloudAccount ? "◉" : "○"}</span> ${state.cloudAccount ? "cloud room" : "account"}`;
  button.setAttribute("aria-label", state.cloudAccount ? `Open cloud room for ${state.cloudAccount.email}` : "Open cloud account");
}

function renderAccountDialog() {
  const panel = document.querySelector("#accountPanel");
  if (!panel) return;
  if (state.cloudAccount) {
    const ttsStatus = state.cloudTtsStatus;
    const ttsCopy = !ttsStatus ? "checking cloud voice readiness…" : ttsStatus.configured ? `cloud voice ready · ${ttsStatus.maxSsmlBytes} bytes per section · ${ttsStatus.requestsPerMinute} requests/min` : "cloud voice needs a server-side Google credential";
    const sessionRows = state.cloudSessions.length ? state.cloudSessions.map((session) => `<div class="session-row"><div><strong>${escapeHtml(session.deviceLabel)}</strong><small>${escapeHtml(session.userAgent)} · active ${escapeHtml(new Date(session.lastSeenAt).toLocaleDateString("en-GB"))}</small></div>${session.current ? `<span class="session-current">this device</span>` : `<button type="button" class="text-button dark-text" data-revoke-session="${escapeAttribute(session.id)}">revoke</button>`}</div>`).join("") : `<p class="session-empty">Device sessions appear here after the room syncs.</p>`;
    const securityCopy = state.cloudSecurity ? `${state.cloudSecurity.https ? "HTTPS ready" : "local HTTP"} · ${state.cloudSecurity.deletionRetentionDays} day restore window` : "checking room security…";
    panel.innerHTML = `<p class="account-address">${escapeHtml(state.cloudAccount.displayName)}<br /><small>${escapeHtml(state.cloudAccount.email)}</small></p><p class="account-status ${state.cloudStatus.includes("could not") ? "error" : ""}" id="accountStatus">${escapeHtml(state.cloudStatus || "Your local writing can now travel with you.")}</p><div class="tts-status"><span class="tts-status-dot ${ttsStatus?.configured ? "ready" : ""}"></span><div><strong>poem voice room</strong><small>${escapeHtml(ttsCopy)}</small></div></div><div class="account-actions"><button type="button" class="primary-button" id="accountSyncButton" ${state.cloudBusy ? "disabled" : ""}>${state.cloudBusy ? "syncing" : "sync now"} <span>↗</span></button><button type="button" class="text-button dark-text" id="accountLogoutButton">sign out</button></div><details class="device-details" open><summary>devices and sessions</summary><p class="security-copy">${escapeHtml(securityCopy)}</p><div class="session-list">${sessionRows}</div></details><details class="account-danger"><summary>delete cloud room</summary><p>This moves the encrypted cloud copy into its temporary restore window. Your browser copy remains here.</p><input id="accountDeletePassword" type="password" placeholder="account password" autocomplete="current-password" /><button type="button" class="text-button danger-text" id="accountDeleteButton">delete account</button></details>`;
    return;
  }
  panel.innerHTML = `<p class="account-status">Sign in to sync this room across devices. Local writing stays available if the cloud room is sleeping.</p><div class="account-fields"><label>name <input id="accountDisplayName" placeholder="a quiet writer" autocomplete="name" /></label><label>email <input id="accountEmail" type="email" placeholder="you@example.com" autocomplete="email" /></label><label>password <input id="accountPassword" type="password" minlength="8" placeholder="8 characters or more" autocomplete="current-password" /></label></div><div class="account-actions"><button type="button" class="primary-button" id="accountRegisterButton">begin cloud room <span>↗</span></button><button type="button" class="text-button dark-text" id="accountLoginButton">sign in</button></div><details class="recovery-details"><summary>forgot the account password?</summary><p>Enter your email and the configured recovery service will send a short-lived link.</p><input id="recoveryEmail" type="email" placeholder="you@example.com" autocomplete="email" /><button type="button" class="text-button dark-text" id="recoveryRequestButton">send recovery link</button><label>recovery token <input id="recoveryToken" placeholder="paste token from your email" autocomplete="one-time-code" /></label><label>new password <input id="recoveryPassword" type="password" minlength="8" placeholder="8 characters or more" autocomplete="new-password" /></label><button type="button" class="text-button dark-text" id="recoveryResetButton">set new password</button><small id="recoveryStatus">${escapeHtml(state.recoveryStatus)}</small></details>`;
}

async function refreshCloudSecurity() {
  if (!state.cloudAccount) return;
  try {
    const [sessionPayload, security] = await Promise.all([loadSessions(), getCloudSecurityStatus()]);
    state.cloudSessions = sessionPayload.sessions || [];
    state.cloudSecurity = security;
  } catch (error) {
    state.cloudStatus = error.message;
  }
  renderAccountDialog();
}

function openAccountDialog() {
  state.cloudStatus = "";
  renderAccountDialog();
  accountDialog.showModal();
  if (state.cloudAccount) refreshCloudSecurity();
}

function hasLocalWriting() {
  return workspace.poems.length > 0 || workspace.snippets.length > 0 || (workspace.capsules || []).length > 0 || Object.keys(workspace.notes || {}).length > 0 || Boolean(workspace.draft) || Boolean(workspace.poemDraft);
}

function mergeRecords(localRecords = [], remoteRecords = []) {
  const records = new Map(localRecords.map((record) => [record.id, record]));
  remoteRecords.forEach((record) => records.set(record.id, record));
  return [...records.values()];
}

function mergedWorkspace(remoteWorkspace) {
  const dictionary = new Map((workspace.dictionary || []).map((entry) => [entry.id || `${entry.poemId}:${entry.word}`, entry]));
  (remoteWorkspace.dictionary || []).forEach((entry) => dictionary.set(entry.id || `${entry.poemId}:${entry.word}`, entry));
  return {
    ...workspace,
    ...remoteWorkspace,
    poems: mergeRecords(workspace.poems, remoteWorkspace.poems),
    snippets: mergeRecords(workspace.snippets, remoteWorkspace.snippets),
    dictionary: [...dictionary.values()],
    capsules: mergeRecords(workspace.capsules || [], remoteWorkspace.capsules || []),
    readCounts: { ...(workspace.readCounts || {}), ...(remoteWorkspace.readCounts || {}) },
    notes: { ...(workspace.notes || {}), ...(remoteWorkspace.notes || {}) },
    settings: { ...(workspace.settings || {}), ...(remoteWorkspace.settings || {}) },
    draft: remoteWorkspace.draft || workspace.draft || "",
    poemDraft: remoteWorkspace.poemDraft || workspace.poemDraft || null
  };
}

function applyWorkspace(nextWorkspace) {
  workspace.poems = Array.isArray(nextWorkspace.poems) ? nextWorkspace.poems : [];
  workspace.snippets = Array.isArray(nextWorkspace.snippets) ? nextWorkspace.snippets : [];
  workspace.dictionary = Array.isArray(nextWorkspace.dictionary) ? nextWorkspace.dictionary : [];
  workspace.capsules = Array.isArray(nextWorkspace.capsules) ? nextWorkspace.capsules : [];
  workspace.readCounts = nextWorkspace.readCounts || {};
  workspace.notes = nextWorkspace.notes || {};
  workspace.draft = nextWorkspace.draft || "";
  workspace.poemDraft = nextWorkspace.poemDraft || null;
  workspace.settings = nextWorkspace.settings || {};

  for (let index = poems.length - 1; index >= 0; index -= 1) if (poems[index].userCreated) poems.splice(index, 1);
  workspace.poems.forEach((savedPoem) => {
    const existingIndex = poems.findIndex((poem) => poem.id === savedPoem.id);
    if (existingIndex >= 0) poems[existingIndex] = savedPoem;
    else poems.push(savedPoem);
  });
  for (let index = snippets.length - 1; index >= 0; index -= 1) if (snippets[index].userCreated) snippets.splice(index, 1);
  snippets.push(...workspace.snippets);
  state.notes = workspace.notes;
  state.mood = workspace.settings.mood || state.mood;
  state.filter = workspace.settings.filter || state.filter;
  state.search = workspace.settings.search || "";
  state.readerMode = workspace.settings.readerMode || state.readerMode;
  state.language = workspace.settings.language || state.language;
  state.voiceRate = Number(workspace.settings.voiceRate || state.voiceRate);
  state.voicePitch = Number(workspace.settings.voicePitch || state.voicePitch);
  state.voiceName = workspace.settings.voiceName || state.voiceName;
  state.tonightFeeling = workspace.settings.tonightFeeling || state.tonightFeeling;
  state.whisperSnippetId = workspace.settings.whisperSnippetId || state.whisperSnippetId;
  soundscape.applyMix(workspace.settings.soundMix || {});
  state.locked = Boolean(workspace.settings.locked);
  if (cloudHydrating) saveWorkspace(workspace);
  renderCapsuleNote();
  renderContent();
  renderReader();
  updateLockButton();
}

async function pushCloud(retry = true) {
  if (!state.cloudAccount || cloudHydrating) return;
  state.cloudBusy = true;
  renderAccountDialog();
  try {
    const result = await saveRemoteWorkspace(workspace, state.cloudRevision);
    state.cloudRevision = result.revision;
    state.cloudAccount = { ...state.cloudAccount, revision: result.revision, updatedAt: result.updatedAt };
    state.cloudStatus = "synced just now";
  } catch (error) {
    if (error.status === 409 && retry && error.payload?.workspace) {
      cloudHydrating = true;
      const merged = mergedWorkspace(error.payload.workspace);
      applyWorkspace(merged);
      state.cloudRevision = error.payload.revision;
      cloudHydrating = false;
      state.cloudStatus = "merged another device, then synced";
      state.cloudBusy = false;
      return pushCloud(false);
    }
    state.cloudStatus = error.message;
  } finally {
    state.cloudBusy = false;
    renderAccountDialog();
    updateAccountButton();
  }
}

function queueCloudSync() {
  if (!state.cloudAccount || cloudHydrating) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(() => pushCloud(), 850);
}

async function hydrateCloud() {
  if (!state.cloudAccount) return;
  state.cloudBusy = true;
  state.cloudStatus = "opening the cloud room...";
  renderAccountDialog();
  try {
    const remote = await loadRemoteWorkspace();
    state.cloudRevision = remote.revision;
    const remoteHasWriting = remote.workspace.poems?.length || remote.workspace.snippets?.length || Object.keys(remote.workspace.notes || {}).length;
    if (!remoteHasWriting && hasLocalWriting()) {
      await pushCloud();
    } else {
      cloudHydrating = true;
      const merged = mergedWorkspace(remote.workspace);
      applyWorkspace(merged);
      cloudHydrating = false;
      const changed = JSON.stringify(merged) !== JSON.stringify(remote.workspace);
      if (changed) await pushCloud();
      else state.cloudStatus = "synced just now";
    }
  } catch (error) {
    cloudHydrating = false;
    state.cloudStatus = error.message.includes("Failed to fetch") ? "cloud room is sleeping; local writing is safe" : error.message;
  } finally {
    state.cloudBusy = false;
    renderAccountDialog();
    updateAccountButton();
  }
}

async function completeCloudAuth(action) {
  const input = {
    displayName: document.querySelector("#accountDisplayName")?.value.trim(),
    email: document.querySelector("#accountEmail")?.value.trim(),
    password: document.querySelector("#accountPassword")?.value
  };
  state.cloudBusy = true;
  state.cloudStatus = "opening the cloud room...";
  renderAccountDialog();
  try {
    const result = action === "register" ? await registerAccount(input) : await loginAccount(input);
    state.cloudAccount = result.account;
    state.cloudRevision = result.account.revision;
    await refreshCloudTtsStatus();
    await hydrateCloud();
    await refreshCloudSecurity();
  } catch (error) {
    state.cloudStatus = error.message;
  } finally {
    state.cloudBusy = false;
    renderAccountDialog();
    updateAccountButton();
  }
}

async function refreshCloudTtsStatus() {
  if (!state.cloudAccount) {
    state.cloudTtsStatus = null;
    return;
  }
  try {
    state.cloudTtsStatus = await getCloudTtsStatus();
  } catch {
    state.cloudTtsStatus = null;
  }
}

async function bootstrapCloud() {
  if (!state.cloudAccount) return;
  try {
    state.cloudAccount = await getCloudAccount();
    state.cloudRevision = state.cloudAccount.revision;
    await refreshCloudTtsStatus();
    await hydrateCloud();
    await refreshCloudSecurity();
  } catch (error) {
    state.cloudStatus = error.message.includes("Failed to fetch") ? "cloud room is sleeping; local writing is safe" : "session expired; sign in again";
    if (error.status === 401) state.cloudAccount = null;
    updateAccountButton();
  }
}

function syncShellView() {
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  shell.className = `app-shell view-${state.tab}`;
  document.body.dataset.room = state.tab;
}

function setTab(tab) {
  const update = () => {
    state.tab = tab;
    syncShellView();
    document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    renderContent();
    renderReader();
  };
  if (typeof document.startViewTransition === "function") document.startViewTransition(update);
  else update();
}

function stopPlayback() {
  state.playing = false;
  state.paused = false;
  state.wordIndex = -1;
  stopSpeaking();
  clearInterval(playbackTimer);
}

let recordingAudio = null;
let explanationAudio = null;

function stopRecordedVoice() {
  if (recordingAudio) {
    recordingAudio.pause();
    recordingAudio.currentTime = 0;
    recordingAudio = null;
  }
  state.recordingPlaying = false;
}

function stopExplanationVoice() {
  if (explanationAudio) {
    explanationAudio.pause();
    explanationAudio.currentTime = 0;
    explanationAudio = null;
  }
  state.explanationPlaying = false;
}

async function toggleVoiceRecording() {
  if (state.explanationRecordingActive) return;
  if (state.recordingActive) {
    stopVoiceRecording();
    return;
  }
  stopPlayback();
  stopRecordedVoice();
  state.recordingError = "";
  const started = await startVoiceRecording(currentRecordingKey(), {
    onStart: () => {
      state.recordingActive = true;
      renderReader();
    },
    onStop: (blob) => {
      clearRecordingUrl();
      state.recordingUrl = URL.createObjectURL(blob);
      state.recordingActive = false;
      state.recordingError = "";
      renderReader();
    },
    onError: (error) => {
      state.recordingActive = false;
      state.recordingError = error.message;
      renderReader();
    }
  });
  if (!started) state.recordingActive = false;
}

function playRecordedVoice() {
  if (!state.recordingUrl) return;
  stopPlayback();
  stopExplanationVoice();
  stopRecordedVoice();
  recordingAudio = new Audio(state.recordingUrl);
  state.recordingPlaying = true;
  recordingAudio.onended = () => {
    recordingAudio = null;
    state.recordingPlaying = false;
    renderReader();
  };
  recordingAudio.onerror = () => {
    recordingAudio = null;
    state.recordingPlaying = false;
    state.recordingError = "The saved voice note could not be played.";
    renderReader();
  };
  recordingAudio.play().catch(() => {
    state.recordingPlaying = false;
    state.recordingError = "The saved voice note could not be played.";
    renderReader();
  });
  renderReader();
}

async function toggleExplanationRecording() {
  if (state.recordingActive) return;
  if (state.explanationRecordingActive) {
    stopVoiceRecording();
    return;
  }
  stopPlayback();
  stopRecordedVoice();
  stopExplanationVoice();
  state.explanationError = "";
  const started = await startVoiceRecording(currentExplanationKey(), {
    onStart: () => {
      state.explanationRecordingActive = true;
      renderReader();
    },
    onStop: (blob) => {
      clearExplanationUrl();
      state.explanationUrl = URL.createObjectURL(blob);
      state.explanationRecordingActive = false;
      state.explanationError = "";
      renderReader();
    },
    onError: (error) => {
      state.explanationRecordingActive = false;
      state.explanationError = error.message;
      renderReader();
    }
  });
  if (!started) state.explanationRecordingActive = false;
}

function playExplanation() {
  if (!state.explanationUrl) return;
  stopPlayback();
  stopRecordedVoice();
  stopExplanationVoice();
  explanationAudio = new Audio(state.explanationUrl);
  state.explanationPlaying = true;
  explanationAudio.onended = () => {
    explanationAudio = null;
    state.explanationPlaying = false;
    renderReader();
  };
  explanationAudio.onerror = () => {
    explanationAudio = null;
    state.explanationPlaying = false;
    state.explanationError = "The saved explanation could not be played.";
    renderReader();
  };
  explanationAudio.play().catch(() => {
    state.explanationPlaying = false;
    state.explanationError = "The saved explanation could not be played.";
    renderReader();
  });
  renderReader();
}

function formatCaptionTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${rest}`;
}

function downloadTranscript() {
  const poem = currentPoem();
  const key = state.language === "roman" ? "lines" : state.language === "devanagari" ? "devanagari" : "urdu";
  const lines = poem[key] || poem.lines;
  const timedCaptions = state.captions.filter((caption) => Number.isFinite(caption.start));
  const content = timedCaptions.length
    ? timedCaptions.map((caption, index) => `${index + 1}\n${formatSrtTime(caption.start)} --> ${formatSrtTime(caption.end)}\n${caption.text}\n`).join("\n")
    : `${poem.title}\n\n${lines.join("\n")}`;
  const extension = timedCaptions.length ? "srt" : "txt";
  const filename = `${poem.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "poem"}.${extension}`;
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(new Blob([content], { type: timedCaptions.length ? "text/srt" : "text/plain" }));
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function formatSrtTime(seconds) {
  const totalMilliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000).toString().padStart(2, "0");
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000).toString().padStart(2, "0");
  const secs = Math.floor((totalMilliseconds % 60000) / 1000).toString().padStart(2, "0");
  const milliseconds = (totalMilliseconds % 1000).toString().padStart(3, "0");
  return `${hours}:${minutes}:${secs},${milliseconds}`;
}

function startPlayback() {
  const poem = currentPoem();
  const key = state.language === "roman" ? "lines" : state.language === "devanagari" ? "devanagari" : "urdu";
  const lines = poem[key] || poem.lines;
  stopRecordedVoice();
  stopExplanationVoice();
  state.voiceError = "";
  state.playing = true;
  state.paused = false;
  state.lineIndex = 0;
  state.wordIndex = -1;
  state.captions = lines.map((text, index) => ({ index, text, start: null, end: null }));
  clearInterval(playbackTimer);
  const started = speakLines(lines, {
    lang: languageToVoiceLanguage(),
    voiceName: state.voiceName,
    rate: state.voiceRate,
    pitch: state.voicePitch,
    onLineStart: (index) => { state.lineIndex = index; state.wordIndex = -1; renderReader(); },
    onWordStart: (lineIndex, wordIndex) => { state.lineIndex = lineIndex; state.wordIndex = wordIndex; renderReader(); },
    onCaptions: (captions) => {
      const timed = new Map(captions.map((caption) => [caption.index, caption]));
      state.captions = state.captions.map((caption) => timed.get(caption.index) || caption);
      if (state.captionsVisible) renderReader();
    },
    onDone: () => { state.playing = false; state.paused = false; state.lineIndex = 0; state.wordIndex = -1; renderReader(); },
    onError: (error) => { state.voiceError = error?.message?.toLowerCase().includes("credential") ? "cloud voice needs its server key; showing reading beats instead" : "voice unavailable right now; showing reading beats instead"; startFallbackPlayback(lines.length); }
  });
  if (!started) startFallbackPlayback(lines.length);
}

function startFallbackPlayback(lineCount) {
  state.playing = true;
  clearInterval(playbackTimer);
  playbackTimer = setInterval(() => {
    state.lineIndex += 1;
    if (state.lineIndex >= lineCount) {
      stopPlayback();
      state.lineIndex = 0;
    }
    renderReader();
  }, 1850);
}

function updateSoundButton() {
  const button = document.querySelector("#soundButton");
  if (!button) return;
  button.setAttribute("aria-pressed", String(state.soundOn));
  button.innerHTML = `<span>◌</span> sound ${state.soundOn ? "on" : "off"}`;
}

function soundRows() {
  const selected = new Set(Object.keys(soundscape.getMix()));
  return SOUND_LIBRARY.map((sound) => `<label class="sound-row"><input type="checkbox" data-sound-toggle="${sound.id}" ${selected.has(sound.id) ? "checked" : ""} /><span class="sound-row-copy"><small>${escapeHtml(sound.category)}</small><strong>${escapeHtml(sound.label)}</strong></span><input class="sound-volume" type="range" min="0" max="0.7" step="0.01" value="${soundscape.getVolume(sound.id)}" data-sound-volume="${sound.id}" aria-label="${escapeAttribute(sound.label)} volume" /><output>${Math.round(soundscape.getVolume(sound.id) * 100)}%</output></label>`).join("");
}

function renderSoundDialog() {
  const mixer = document.querySelector("#soundMixer");
  const presets = document.querySelector("#soundPresets");
  if (!mixer || !presets) return;
  presets.innerHTML = "";
  mixer.innerHTML = `${soundChoiceMarkup()}${state.soundError ? `<p class="sound-error">${escapeHtml(state.soundError)}</p>` : ""}`;
}

function openSoundDialog() {
  renderSoundDialog();
  soundDialog.showModal();
}

function ensureSoundMix() {
  if (Object.keys(soundscape.getMix()).length) return;
  soundscape.applyMix(presetMix("rain-window"));
}

function toggleSoundPlayback() {
  ensureSoundMix();
  if (soundscape.isPlaying()) soundscape.pause();
  else soundscape.play();
  renderSoundDialog();
}

document.addEventListener("paste", (event) => {
  const imageItem = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  const imageFile = imageItem.getAsFile();
  const captureTarget = event.target.closest?.("#capturePasteTarget, #captureDialog");
  // Accept paste anywhere in the poem workspace form or the designated paste target
  const editorTarget = event.target.closest?.("#workspaceImagePasteTarget, #poemWorkspaceForm, .poem-desk-page, #editorPoemArtboard");
  if (captureDialog?.open && captureTarget) {
    event.preventDefault();
    setCaptureImage(imageFile);
  } else if (state.tab === "write" && editorTarget) {
    event.preventDefault();
    addEditorImageFile(imageFile);
  }
});

document.addEventListener("pointerdown", (event) => {
  // Handle image resize (bottom-right corner handle)
  const resizeHandle = event.target.closest?.("[data-image-resize]");
  if (resizeHandle && state.tab === "write") {
    const artboard = document.querySelector("#editorPoemArtboard");
    const image = state.editorImages.find((img) => img.id === resizeHandle.dataset.imageResize);
    if (artboard && image) {
      const imageNode = document.querySelector(`[data-image-id="${CSS.escape(image.id)}"]`);
      const imgRect = imageNode ? imageNode.getBoundingClientRect() : null;
      const artRect = artboard.getBoundingClientRect();
      // Store the center of the image in client coords so we can compute distance
      const cx = imgRect ? imgRect.left + imgRect.width / 2 : event.clientX;
      const cy = imgRect ? imgRect.top + imgRect.height / 2 : event.clientY;
      const startDist = Math.hypot(event.clientX - cx, event.clientY - cy);
      imageInteraction = { type: "resize", artboard: artRect, image, centerX: cx, centerY: cy, startDist, origScale: image.scale || 0.5, moved: false };
      resizeHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
  }

  // Handle image rotate (top-right corner handle)
  const rotateHandle = event.target.closest?.("[data-image-rotate]");
  if (rotateHandle && state.tab === "write") {
    const artboard = document.querySelector("#editorPoemArtboard");
    const image = state.editorImages.find((img) => img.id === rotateHandle.dataset.imageRotate);
    if (artboard && image) {
      const imageNode = document.querySelector(`[data-image-id="${CSS.escape(image.id)}"]`);
      const imgRect = imageNode ? imageNode.getBoundingClientRect() : null;
      const artRect = artboard.getBoundingClientRect();
      const cx = imgRect ? imgRect.left + imgRect.width / 2 : event.clientX;
      const cy = imgRect ? imgRect.top + imgRect.height / 2 : event.clientY;
      const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx) * (180 / Math.PI);
      imageInteraction = { type: "rotate", artboard: artRect, image, centerX: cx, centerY: cy, startAngle, origRotation: image.rotation || 0, moved: false };
      rotateHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
  }

  // Handle sticker resize handle (bottom-right corner)
  const decoResizeHandle = event.target.closest?.("[data-deco-resize]");
  if (decoResizeHandle && state.tab === "write") {
    const deco = state.editorDecorations.find((d) => d.id === decoResizeHandle.dataset.decoResize);
    if (deco) {
      const decoNode = document.querySelector(`[data-decoration-id="${CSS.escape(deco.id)}"]`);
      const nodeRect = decoNode ? decoNode.getBoundingClientRect() : null;
      const cx = nodeRect ? nodeRect.left + nodeRect.width / 2 : event.clientX;
      const cy = nodeRect ? nodeRect.top + nodeRect.height / 2 : event.clientY;
      const startDist = Math.hypot(event.clientX - cx, event.clientY - cy);
      decorationDrag = { type: "resize", deco, centerX: cx, centerY: cy, startDist, origScale: deco.scale || 1, editorMode: true, moved: false };
      decoResizeHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
  }

  // Handle sticker rotate handle (top-right corner)
  const decoRotateHandle = event.target.closest?.("[data-deco-rotate]");
  if (decoRotateHandle && state.tab === "write") {
    const deco = state.editorDecorations.find((d) => d.id === decoRotateHandle.dataset.decoRotate);
    if (deco) {
      const decoNode = document.querySelector(`[data-decoration-id="${CSS.escape(deco.id)}"]`);
      const nodeRect = decoNode ? decoNode.getBoundingClientRect() : null;
      const cx = nodeRect ? nodeRect.left + nodeRect.width / 2 : event.clientX;
      const cy = nodeRect ? nodeRect.top + nodeRect.height / 2 : event.clientY;
      const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx) * (180 / Math.PI);
      decorationDrag = { type: "rotate", deco, centerX: cx, centerY: cy, startAngle, origRotation: deco.rotation || 0, editorMode: true, moved: false };
      decoRotateHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
  }

  // Handle image drag in editor (move)
  const imageBtn = event.target.closest?.("[data-image-id]");
  if (imageBtn && state.tab === "write" && !event.target.closest("[data-image-resize], [data-image-rotate]")) {
    const artboard = document.querySelector("#editorPoemArtboard");
    const image = state.editorImages.find((img) => img.id === imageBtn.dataset.imageId);
    if (artboard && image) {
      state.selectedImageId = image.id;
      const rect = artboard.getBoundingClientRect();
      imageInteraction = { type: "move", artboard: rect, image, rect, startX: event.clientX, startY: event.clientY, origX: image.x, origY: image.y, moved: false };
      imageBtn.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      renderContent();
      return;
    }
  }

  // Handle decoration drag in editor artboard (write mode) — skip when clicking handles
  const editorDecoItem = event.target.closest?.(".decoration-item");
  if (editorDecoItem && state.tab === "write" && !event.target.closest("[data-deco-resize], [data-deco-rotate]")) {
    const artboard = document.querySelector("#editorPoemArtboard");
    const decorations = poemDecorations(currentPoem());
    const decoration = decorations.find((entry) => entry.id === editorDecoItem.dataset.decorationId);
    if (artboard && decoration) {
      state.selectedDecorationId = decoration.id;
      const rect = artboard.getBoundingClientRect();
      decorationDrag = { type: "move", artboard, poem: currentPoem(), decoration, rect, editorMode: true, moved: false };
      editorDecoItem.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      renderContent();
      return;
    }
  }

  // Handle decoration drag in reader (decorate mode)
  const item = event.target.closest?.(".decoration-item");
  if (!item || !state.decorateMode) return;
  const artboard = document.querySelector("#poemArtboard");
  const poem = currentPoem();
  const decoration = poemDecorations(poem).find((entry) => entry.id === item.dataset.decorationId);
  if (!artboard || !decoration) return;
  state.selectedDecorationId = decoration.id;
  const rect = artboard.getBoundingClientRect();
  decorationDrag = { artboard, poem, decoration, rect, editorMode: false, moved: false };
  item.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

document.addEventListener("pointermove", (event) => {
  if (imageInteraction) {
    const { image } = imageInteraction;
    if (imageInteraction.type === "move") {
      const rect = imageInteraction.artboard;
      image.x = Math.min(96, Math.max(4, ((event.clientX - rect.left) / rect.width) * 100));
      image.y = Math.min(96, Math.max(4, ((event.clientY - rect.top) / rect.height) * 100));
      imageInteraction.moved = true;
      const node = document.querySelector(`[data-image-id="${CSS.escape(image.id)}"]`);
      if (node) {
        node.style.left = `${image.x}%`;
        node.style.top = `${image.y}%`;
      }
    } else if (imageInteraction.type === "resize") {
      const dist = Math.hypot(event.clientX - imageInteraction.centerX, event.clientY - imageInteraction.centerY);
      const ratio = dist / (imageInteraction.startDist || 1);
      image.scale = Math.min(3.5, Math.max(0.1, imageInteraction.origScale * ratio));
      imageInteraction.moved = true;
      const node = document.querySelector(`[data-image-id="${CSS.escape(image.id)}"]`);
      if (node) node.style.transform = `translate(-50%, -50%) rotate(${image.rotation || 0}deg) scale(${image.scale})`;
      // Update slider if visible
      const scaleInput = document.querySelector("#imageScaleInput");
      const scaleOutput = document.querySelector("#imageScaleValue");
      if (scaleInput) scaleInput.value = image.scale;
      if (scaleOutput) scaleOutput.textContent = `${image.scale.toFixed(2)}×`;
    } else if (imageInteraction.type === "rotate") {
      const angle = Math.atan2(event.clientY - imageInteraction.centerY, event.clientX - imageInteraction.centerX) * (180 / Math.PI);
      image.rotation = Math.round(imageInteraction.origRotation + (angle - imageInteraction.startAngle));
      imageInteraction.moved = true;
      const node = document.querySelector(`[data-image-id="${CSS.escape(image.id)}"]`);
      if (node) node.style.transform = `translate(-50%, -50%) rotate(${image.rotation}deg) scale(${image.scale || 0.5})`;
      // Update slider if visible
      const rotInput = document.querySelector("#imageRotationInput");
      const rotOutput = document.querySelector("#imageRotationValue");
      if (rotInput) rotInput.value = image.rotation;
      if (rotOutput) rotOutput.textContent = `${image.rotation}°`;
    }
    return;
  }
  if (!decorationDrag) return;
  if (decorationDrag.type === "resize" && decorationDrag.deco) {
    const deco = decorationDrag.deco;
    const dist = Math.hypot(event.clientX - decorationDrag.centerX, event.clientY - decorationDrag.centerY);
    const ratio = dist / (decorationDrag.startDist || 1);
    deco.scale = Math.min(3.5, Math.max(0.25, decorationDrag.origScale * ratio));
    decorationDrag.moved = true;
    const node = document.querySelector(`[data-decoration-id="${CSS.escape(deco.id)}"]`);
    if (node) node.style.transform = `translate(-50%, -50%) rotate(${deco.rotation || 0}deg) scale(${deco.scale})`;
    const scaleOut = document.querySelector("#editorDecoScaleValue");
    const scaleInput = document.querySelector("#editorDecoScaleInput");
    if (scaleOut) scaleOut.textContent = `${deco.scale.toFixed(2)}\u00d7`;
    if (scaleInput) scaleInput.value = deco.scale;
  } else if (decorationDrag.type === "rotate" && decorationDrag.deco) {
    const deco = decorationDrag.deco;
    const angle = Math.atan2(event.clientY - decorationDrag.centerY, event.clientX - decorationDrag.centerX) * (180 / Math.PI);
    deco.rotation = Math.round(decorationDrag.origRotation + (angle - decorationDrag.startAngle));
    decorationDrag.moved = true;
    const node = document.querySelector(`[data-decoration-id="${CSS.escape(deco.id)}"]`);
    if (node) node.style.transform = `translate(-50%, -50%) rotate(${deco.rotation}deg) scale(${deco.scale || 1})`;
    const rotOut = document.querySelector("#editorDecoRotValue");
    const rotInput = document.querySelector("#editorDecoRotInput");
    if (rotOut) rotOut.textContent = `${deco.rotation}\u00b0`;
    if (rotInput) rotInput.value = deco.rotation;
  } else if (decorationDrag.decoration) {
    const { decoration, rect } = decorationDrag;
    decoration.x = Math.min(96, Math.max(4, ((event.clientX - rect.left) / rect.width) * 100));
    decoration.y = Math.min(96, Math.max(4, ((event.clientY - rect.top) / rect.height) * 100));
    decorationDrag.moved = true;
    const item = document.querySelector(`[data-decoration-id="${CSS.escape(decoration.id)}"]`);
    if (item) {
      item.style.left = `${decoration.x}%`;
      item.style.top = `${decoration.y}%`;
    }
  }
});

document.addEventListener("pointerup", () => {
  if (imageInteraction) {
    if (imageInteraction.moved) persistEditorImages();
    imageInteraction = null;
    return;
  }
  if (!decorationDrag) return;
  if (decorationDrag.moved) {
    // Sticker resize/rotate in editor
    if ((decorationDrag.type === "resize" || decorationDrag.type === "rotate") && decorationDrag.deco) {
      state.editorDecorations = state.editorDecorations.map((item) =>
        item.id === decorationDrag.deco.id ? decorationDrag.deco : item
      );
      if (state.editingPoemId) {
        const poem = poems.find((p) => p.id === state.editingPoemId);
        if (poem) savePoemDecorations(poem, state.editorDecorations);
      }
    } else if (decorationDrag.editorMode && decorationDrag.decoration) {
      // Sticker move in editor
      state.editorDecorations = state.editorDecorations.map((item) =>
        item.id === decorationDrag.decoration.id ? decorationDrag.decoration : item
      );
      if (state.editingPoemId) {
        const poem = poems.find((p) => p.id === state.editingPoemId);
        if (poem) savePoemDecorations(poem, state.editorDecorations);
      }
    } else if (decorationDrag.decoration) {
      savePoemDecorations(decorationDrag.poem, [ ...(decorationDrag.poem.decorations || []).filter((item) => item.id !== decorationDrag.decoration.id), decorationDrag.decoration ]);
    }
  }
  decorationDrag = null;
});

document.addEventListener("keydown", (event) => {
  if (!(["Enter", " "].includes(event.key))) return;
  const openPoemButton = event.target.closest?.("[data-open-poem]");
  if (openPoemButton) {
    event.preventDefault();
    openPoemButton.click();
    return;
  }
  const poetButton = event.target.closest?.("[data-poet]");
  if (!poetButton) return;
  event.preventDefault();
  poetButton.click();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#accountRegisterButton")) {
    completeCloudAuth("register");
    return;
  }
  if (event.target.closest("#accountLoginButton")) {
    completeCloudAuth("login");
    return;
  }
  if (event.target.closest("#recoveryRequestButton")) {
    const email = document.querySelector("#recoveryEmail")?.value.trim();
    if (!email) return;
    requestPasswordRecovery(email).then((result) => {
      state.recoveryStatus = result.devToken ? `development recovery token: ${result.devToken}` : result.message;
      renderAccountDialog();
    }).catch((error) => {
      state.recoveryStatus = error.message;
      renderAccountDialog();
    });
    return;
  }
  if (event.target.closest("#recoveryResetButton")) {
    const email = document.querySelector("#recoveryEmail")?.value.trim();
    const token = document.querySelector("#recoveryToken")?.value.trim();
    const password = document.querySelector("#recoveryPassword")?.value || "";
    if (!email || !token || password.length < 8) return;
    resetPassword({ email, token, password }).then((result) => {
      state.recoveryStatus = result.message;
      renderAccountDialog();
    }).catch((error) => {
      state.recoveryStatus = error.message;
      renderAccountDialog();
    });
    return;
  }
  if (event.target.closest("#accountSyncButton")) {
    pushCloud();
    return;
  }
  if (event.target.closest("#accountLogoutButton")) {
    logoutAccount().finally(() => {
      state.cloudAccount = null;
      state.cloudRevision = 0;
      state.cloudTtsStatus = null;
      state.cloudSessions = [];
      state.cloudSecurity = null;
      state.cloudStatus = "signed out; local writing remains here";
      renderAccountDialog();
      updateAccountButton();
    });
    return;
  }
  const revokeButton = event.target.closest("[data-revoke-session]");
  if (revokeButton) {
    revokeSession(revokeButton.dataset.revokeSession).then(() => refreshCloudSecurity()).catch((error) => {
      state.cloudStatus = error.message;
      renderAccountDialog();
    });
    return;
  }
  if (event.target.closest("#accountDeleteButton")) {
    const password = document.querySelector("#accountDeletePassword")?.value || "";
    if (!password || !window.confirm("Delete the encrypted cloud room? Your browser copy will remain.")) return;
    deleteCloudAccount(password).then(() => {
      state.cloudAccount = null;
      state.cloudRevision = 0;
      state.cloudTtsStatus = null;
      state.cloudSessions = [];
      state.cloudSecurity = null;
      state.cloudStatus = "cloud room deleted; local writing remains here";
      renderAccountDialog();
      updateAccountButton();
    }).catch((error) => {
      state.cloudStatus = error.message;
      renderAccountDialog();
    });
    return;
  }
  if (event.target.closest("#soundPlayButton")) {
    toggleSoundPlayback();
    return;
  }
  if (event.target.closest("#soundStopButton")) {
    soundscape.stop();
    renderSoundDialog();
    return;
  }
  const soundAction = event.target.closest("[data-sound-action]");
  if (soundAction) {
    if (soundAction.dataset.soundAction === "toggle") toggleSoundPlayback();
    if (soundAction.dataset.soundAction === "stop") soundscape.stop();
    if (state.tab === "read") renderReader();
    else if (state.tab === "write" || state.tab === "desk") renderContent();
    return;
  }
  const soundPreset = event.target.closest("[data-sound-preset]");
  if (soundPreset) {
    soundscape.applyMix(presetMix(soundPreset.dataset.soundPreset));
    renderSoundDialog();
    if (state.tab === "read") renderReader();
    else if (state.tab === "write" || state.tab === "desk") renderContent();
    return;
  }
  const soundToggle = event.target.closest("[data-sound-toggle]");
  if (soundToggle) {
    soundscape.setSelected(soundToggle.dataset.soundToggle, soundToggle.checked);
    renderSoundDialog();
    if (state.tab === "read") renderReader();
    else if (state.tab === "write" || state.tab === "desk") renderContent();
    return;
  }

  if (event.target.closest("#nextPoemButton")) {
    const index = poems.findIndex((poem) => poem.id === state.activePoem);
    state.activePoem = poems[(index + 1 + poems.length) % poems.length]?.id || state.activePoem;
    stopPlayback();
    state.captions = [];
    recordPoemRead(state.activePoem);
    renderReader();
    return;
  }

  if (event.target.closest("#decorateButton")) {
    state.decorateMode = !state.decorateMode;
    if (!state.decorateMode) state.selectedDecorationId = null;
    renderReader();
    return;
  }
  if (event.target.closest("#finishDecoratingButton")) {
    state.decorateMode = false;
    state.selectedDecorationId = null;
    renderReader();
    return;
  }
  const addDecorationButton = event.target.closest("[data-add-decoration]");
  if (addDecorationButton) {
    addDecoration(addDecorationButton.dataset.addDecoration);
    return;
  }
  const decorationItem = event.target.closest("[data-decoration-id]");
  if (decorationItem && (state.decorateMode || state.tab === "write")) {
    state.selectedDecorationId = decorationItem.dataset.decorationId;
    if (state.tab === "write") renderContent(); else renderReader();
    return;
  }
  if (event.target.closest("#removeDecorationButton")) {
    removeSelectedDecoration();
    return;
  }
  const decorationLayer = event.target.closest("[data-decoration-layer]");
  if (decorationLayer) {
    moveSelectedDecorationLayer(decorationLayer.dataset.decorationLayer);
    return;
  }
  if (event.target.closest("#shareCardButton")) {
    downloadShareCard();
    return;
  }
  const ritualPoem = event.target.closest("[data-ritual-poem]");
  if (ritualPoem?.dataset.ritualPoem) {
    state.activePoem = ritualPoem.dataset.ritualPoem;
    state.tab = "read";
    syncShellView();
    document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === "read"));
    state.ritualStatus = "";
    recordPoemRead(state.activePoem);
    stopPlayback();
    renderContent();
    renderReader();
    readerPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (event.target.closest("#captureButton")) {
    openCaptureDialog();
    return;
  }
  const captureMode = event.target.closest("[data-capture-mode]");
  if (captureMode) {
    state.captureMode = captureMode.dataset.captureMode;
    updateCaptureMode();
    setCaptureStatus(state.captureMode === "photo" ? "Choose a clear page image." : state.captureMode === "voice" ? "Your browser will turn speech into an editable draft." : "Paste a poem and let the desk find its couplets.");
    return;
  }
  if (event.target.closest("#formatCaptureButton")) {
    formatCaptureDraft();
    return;
  }
  if (event.target.closest("#captureSpeechButton")) {
    toggleSpeechCapture();
    return;
  }
  if (event.target.closest("#saveCaptureThoughtButton")) {
    saveCaptureThought();
    return;
  }
  if (event.target.closest("#captureOcrButton")) {
    readCaptureImage();
    return;
  }
  if (event.target.closest("#useCaptureButton")) {
    useCaptureDraft();
    return;
  }
  if (event.target.closest("#captureCancelButton")) {
    stopSpeechCapture();
    state.captureListening = false;
    captureDialog.close();
    return;
  }

  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) {
    if (tabButton.dataset.tab === "write") openPoemEditor();
    else setTab(tabButton.dataset.tab);
    return;
  }

  if (event.target.closest("#newPoemButton")) openPoemEditor();
  if (event.target.closest("#editPoemButton")) openPoemEditor(state.activePoem);
  const editPoemButton = event.target.closest("[data-edit-poem]");
  if (editPoemButton) {
    openPoemEditor(editPoemButton.dataset.editPoem);
    return;
  }
  const deletePoemButton = event.target.closest("[data-delete-poem]");
  if (deletePoemButton) {
    deletePoem(deletePoemButton.dataset.deletePoem);
    return;
  }

  const moodButton = event.target.closest("[data-mood]");
  if (moodButton) {
    state.mood = moodButton.dataset.mood;
    persistSettings();
    document.querySelectorAll(".mood-button").forEach((button) => button.classList.toggle("active", button.dataset.mood === state.mood));
    renderContent();
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.filter = filterButton.dataset.filter;
    persistSettings();
    renderContent();
  }

  const poetButton = event.target.closest("[data-poet]");
  if (poetButton) {
    state.tab = "shelf";
    state.filter = "collected";
    state.search = poetButton.dataset.poet;
    syncShellView();
    document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === "shelf"));
    renderContent();
    return;
  }

  const openButton = event.target.closest("[data-open-poem]");
  if (openButton) {
    state.activePoem = openButton.dataset.openPoem;
    state.tab = "read";
    syncShellView();
    document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === "read"));
    recordPoemRead(state.activePoem);
    state.ritualStatus = "";
    state.captions = [];
    stopPlayback();
    renderContent();
    renderReader();
    refreshVoiceRecordings();
    readerPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const star = event.target.closest("[data-snippet]");
  if (star) {
    const snippet = snippets.find((item) => item.id === star.dataset.snippet);
    if (snippet) {
      state.activePoem = snippet.poemId;
      state.tab = "read";
      syncShellView();
      document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === "read"));
      recordPoemRead(state.activePoem);
      state.ritualStatus = "";
      state.captions = [];
      renderContent();
      renderReader();
      refreshVoiceRecordings();
      readerPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const modeButton = event.target.closest("[data-mode]");
  if (modeButton) { state.readerMode = modeButton.dataset.mode; persistSettings(); renderReader(); }
  const languageButton = event.target.closest("[data-language]");
  if (languageButton) { state.language = languageButton.dataset.language; state.captions = []; persistSettings(); refreshVoiceRecordings(); }

  if (event.target.closest("#readButton")) {
    state.playing ? stopPlayback() : startPlayback();
    renderReader();
  }

  if (event.target.closest("#captionToggle")) {
    state.captionsVisible = !state.captionsVisible;
    renderReader();
  }

  if (event.target.closest("#transcriptButton")) {
    downloadTranscript();
  }

  if (event.target.closest("#addDictionaryButton")) {
    addDictionaryEntry();
    return;
  }

  if (event.target.closest("#recordVoiceButton")) {
    toggleVoiceRecording();
    return;
  }

  if (event.target.closest("#playRecordingButton")) {
    state.recordingPlaying ? stopRecordedVoice() : playRecordedVoice();
    renderReader();
    return;
  }

  if (event.target.closest("#recordExplanationButton")) {
    toggleExplanationRecording();
    return;
  }

  if (event.target.closest("#playExplanationButton")) {
    state.explanationPlaying ? stopExplanationVoice() : playExplanation();
    renderReader();
    return;
  }

  if (event.target.closest("#pauseButton")) {
    if (!state.playing) return;
    state.paused = !state.paused;
    state.paused ? pauseSpeaking() : resumeSpeaking();
    renderReader();
  }

  if (event.target.closest("#stopButton")) {
    stopPlayback();
    renderReader();
  }

  if (event.target.closest("#noteButton")) {
    const note = window.prompt("Leave a margin beside this poem", state.notes[currentPoem().id] || "");
    if (note === null) return;
    state.notes[currentPoem().id] = note.trim();
    persistSettings();
    renderReader();
  }

  // Paste image button in editor sticker column
  if (event.target.closest("#pasteWorkspaceImageButton")) {
    pasteImageFromClipboard("workspaceImagePasteTarget");
    return;
  }

  // Paste image button in capture dialog
  if (event.target.closest("#pasteCaptureImageButton")) {
    pasteImageFromClipboard("capturePasteTarget");
    return;
  }

  // Select an image in the editor artboard
  const imageButton = event.target.closest("[data-image-id]");
  if (imageButton && state.tab === "write") {
    state.selectedImageId = imageButton.dataset.imageId;
    renderContent();
    return;
  }

  // Remove selected image
  if (event.target.closest("#removeImageButton")) {
    state.editorImages = state.editorImages.filter((img) => img.id !== state.selectedImageId);
    state.selectedImageId = null;
    persistEditorImages();
    renderContent();
    return;
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#searchInput")) {
    const cursor = event.target.selectionStart;
    state.search = event.target.value;
    persistSettings();
    renderContent();
    const nextSearch = document.querySelector("#searchInput");
    if (nextSearch) {
      nextSearch.focus();
      nextSearch.setSelectionRange(cursor, cursor);
    }
  }
  if (event.target.matches("#poemTitle, #poemMood, #poemSource, #poemTags, #poemSharing, #poemLines, #workspacePoemTitle, #workspacePoemMood, #workspacePoemSource, #workspacePoemTags, #workspacePoemSharing, #workspacePoemLines")) {
    if (!state.editingPoemId) {
      workspace.poemDraft = currentPoemDraft();
      saveWorkspace(workspace);
    }
  }
  if (event.target.matches("#rateInput, #pitchInput")) {
    if (event.target.id === "rateInput") state.voiceRate = Number(event.target.value);
    if (event.target.id === "pitchInput") state.voicePitch = Number(event.target.value);
    persistSettings();
    const output = document.querySelector(event.target.id === "rateInput" ? "#rateValue" : "#pitchValue");
    if (output) output.textContent = `${Number(event.target.value).toFixed(2)}${event.target.id === "rateInput" ? "×" : ""}`;
  }
  if (event.target.matches("#decorationScaleInput, #decorationRotationInput")) {
    updateSelectedDecoration(event.target.id === "decorationScaleInput" ? "scale" : "rotation", event.target.value);
  }
  // Image scale/rotation sliders in editor sticker column
  if (event.target.matches("#imageScaleInput, #imageRotationInput")) {
    const image = state.editorImages.find((img) => img.id === state.selectedImageId);
    if (!image) return;
    const isScale = event.target.id === "imageScaleInput";
    image[isScale ? "scale" : "rotation"] = Number(event.target.value);
    const scaleOutput = document.querySelector("#imageScaleValue");
    const rotationOutput = document.querySelector("#imageRotationValue");
    if (scaleOutput) scaleOutput.textContent = `${Number(image.scale).toFixed(2)}×`;
    if (rotationOutput) rotationOutput.textContent = `${Math.round(image.rotation)}°`;
    const node = document.querySelector(`[data-image-id="${CSS.escape(image.id)}"]`);
    if (node) node.style.transform = `translate(-50%, -50%) rotate(${image.rotation}deg) scale(${image.scale})`;
    persistEditorImages();
  }
  // Editor sticker scale/rotation sliders
  if (event.target.matches("#editorDecoScaleInput, #editorDecoRotInput")) {
    const deco = state.editorDecorations.find((d) => d.id === state.selectedDecorationId);
    if (!deco) return;
    const isScale = event.target.id === "editorDecoScaleInput";
    deco[isScale ? "scale" : "rotation"] = Number(event.target.value);
    const scaleOut = document.querySelector("#editorDecoScaleValue");
    const rotOut = document.querySelector("#editorDecoRotValue");
    if (scaleOut) scaleOut.textContent = `${deco.scale.toFixed(2)}\u00d7`;
    if (rotOut) rotOut.textContent = `${Math.round(deco.rotation)}\u00b0`;
    const node = document.querySelector(`[data-decoration-id="${CSS.escape(deco.id)}"]`);
    if (node) node.style.transform = `translate(-50%, -50%) rotate(${deco.rotation}deg) scale(${deco.scale})`;
    // Persist if editing an existing poem
    if (state.editingPoemId) {
      const poem = poems.find((p) => p.id === state.editingPoemId);
      if (poem) savePoemDecorations(poem, state.editorDecorations);
    }
  }
  if (event.target.matches("[data-sound-volume]")) {
    soundscape.setVolume(event.target.dataset.soundVolume, event.target.value);
    const output = event.target.parentElement.querySelector("output");
    if (output) output.textContent = `${Math.round(Number(event.target.value) * 100)}%`;
    if (state.tab === "read") renderReader();
    else if (state.tab === "write" || state.tab === "desk") renderContent();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("#workspacePoemImage")) {
    handleImageImport(event.target);
    return;
  }
  // When a file is chosen in the capture dialog photo tab, set the preview image immediately
  if (event.target.matches("#captureImage")) {
    const file = event.target.files?.[0];
    if (file) setCaptureImage(file);
    return;
  }
  if (event.target.matches("#readPoemSelect")) {
    state.activePoem = event.target.value;
    stopPlayback();
    state.captions = [];
    recordPoemRead(state.activePoem);
    renderReader();
    return;
  }
  if (event.target.matches("[data-sound-single]")) {
    if (event.target.value) soundscape.applyMix({ [event.target.value]: 0.24 });
    renderSoundDialog();
    if (state.tab === "read") renderReader();
    else if (state.tab === "write" || state.tab === "desk") renderContent();
    return;
  }
  if (event.target.matches("#poemMood, #poemSharing, #workspacePoemMood, #workspacePoemSharing") && !state.editingPoemId) {
    workspace.poemDraft = currentPoemDraft();
    saveWorkspace(workspace);
  }
  if (event.target.matches("#voiceSelect")) {
    state.voiceName = event.target.value;
    persistSettings();
    renderReader();
  }
  if (event.target.matches("#tonightFeeling")) {
    state.tonightFeeling = event.target.value;
    persistSettings();
    renderContent();
  }
});

captureDialog?.addEventListener("close", () => {
  stopSpeechCapture();
  state.captureListening = false;
});

document.querySelector("#thoughtInput")?.addEventListener("input", (event) => {
  workspace.draft = event.target.value;
  saveWorkspace(workspace);
});

document.querySelector("#thoughtForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#thoughtInput");
  const mood = document.querySelector("#thoughtMood").value;
  const tags = tagList(document.querySelector("#thoughtTags").value);
  if (!input.value.trim()) return;
  const createdSnippet = { id: `new-${Date.now()}`, title: input.value.trim(), time: "just now · " + mood, mood, tags, sharePermission: document.querySelector("#thoughtSharing").value === "shareable" ? "shareable" : "private", symbol: "✦", poemId: "window-light", x: 0.55, y: 0.5, userCreated: true };
  snippets.push(createdSnippet);
  workspace.snippets.push(createdSnippet);
  workspace.draft = "";
  saveWorkspace(workspace);
  input.value = "";
  document.querySelector("#thoughtTags").value = "";
  document.querySelector("#thoughtSharing").value = "private";
  dialog.close();
  renderContent();
});

function saveCurrentPoem(event) {
  event.preventDefault();
  const draft = currentPoemDraft();
  const lines = draft.lines.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    const status = document.querySelector("#poemEditorStatus");
    if (status) status.textContent = "Give the page one line before you leave it.";
    document.querySelector("#workspacePoemLines")?.focus();
    return;
  }

  const existing = state.editingPoemId ? poems.find((poem) => poem.id === state.editingPoemId) : null;
  const poem = {
    ...(existing || {}),
    id: existing?.id || `poem-${Date.now()}`,
    title: draft.title.trim() || lines[0].slice(0, 58),
    owner: existing?.owner || "mine",
    userCreated: true,
    mood: draft.mood,
    date: existing?.date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toLowerCase(),
    source: draft.source.trim() || "written at the desk",
    tags: tagList(draft.tags),
    sharePermission: draft.sharePermission === "shareable" ? "shareable" : "private",
    replyTo: state.replyToPoemId || existing?.replyTo || null,
    lines,
    devanagari: existing?.devanagari || lines,
    urdu: existing?.urdu || lines,
    decorations: existing?.decorations || state.editorDecorations,
    images: state.editorImages,
    poet: existing?.owner === "collected" ? (document.querySelector("#workspacePoemPoet")?.value.trim() || existing.poet) : existing?.poet,
    whySaved: existing?.owner === "collected" ? (document.querySelector("#workspacePoemWhySaved")?.value.trim() || existing.whySaved) : existing?.whySaved
  };

  const existingIndex = poems.findIndex((item) => item.id === poem.id);
  if (existingIndex >= 0) poems[existingIndex] = poem;
  else poems.push(poem);
  persistPoem(poem);
  workspace.poemDraft = null;
  state.activePoem = poem.id;
  state.replyToPoemId = null;
  if (poemDialog.open) poemDialog.close();
  setTab("read");
}

document.querySelector("#poemForm")?.addEventListener("submit", saveCurrentPoem);
document.addEventListener("submit", (event) => {
  if (event.target.id === "poemWorkspaceForm") saveCurrentPoem(event);
  if (event.target.id === "affirmationForm") {
    event.preventDefault();
    const input = document.querySelector("#affirmationInput");
    const text = input?.value.trim();
    if (!text) return;
    workspace.affirmations = Array.isArray(workspace.affirmations) ? workspace.affirmations : [];
    workspace.affirmations.unshift({ id: `affirmation-${Date.now()}`, text, createdAt: Date.now() });
    saveWorkspace(workspace);
    input.value = "";
    renderContent();
  }
});

document.querySelector("#capsuleButton")?.addEventListener("click", openCapsuleDialog);
document.querySelector("#capsuleCancelButton")?.addEventListener("click", () => capsuleDialog?.close());
document.querySelector("#capsuleForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = document.querySelector("#capsuleMessage").value.trim();
  const dateValue = document.querySelector("#capsuleDate").value;
  const unlockAt = new Date(`${dateValue}T00:00:00`).getTime();
  if (!message || !dateValue || !Number.isFinite(unlockAt) || unlockAt <= Date.now()) return;
  workspace.capsules = Array.isArray(workspace.capsules) ? workspace.capsules : [];
  workspace.capsules.push({ id: `capsule-${Date.now()}`, message, createdAt: Date.now(), unlockAt });
  saveWorkspace(workspace);
  capsuleDialog.close();
  renderCapsuleNote();
});

document.querySelector("#lockToggle")?.addEventListener("click", (event) => {
  if (!workspace.settings.pinHash) {
    configureLockDialog("setup");
    return;
  }
  state.locked = true;
  persistSettings();
  updateLockButton();
  configureLockDialog("unlock");
});

document.querySelector("#lockForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = document.querySelector("#lockPin").value;
  const confirmPin = document.querySelector("#lockPinConfirm").value;
  if (pin.length < 4) return;
  if (lockMode === "setup") {
    if (pin !== confirmPin) return;
    workspace.settings.pinHash = await hashSecret(pin);
    saveWorkspace(workspace);
    state.locked = false;
    lockDialog.close();
    updateLockButton();
    return;
  }
  if ((await hashSecret(pin)) !== workspace.settings.pinHash) return;
  state.locked = false;
  persistSettings();
  lockDialog.close();
  updateLockButton();
});

lockDialog?.addEventListener("cancel", (event) => {
  if (lockMode === "unlock") event.preventDefault();
});

lockDialog?.addEventListener("click", (event) => {
  if (lockMode === "unlock" && event.target.closest('[value="cancel"]')) event.preventDefault();
});

document.querySelector("#accountButton")?.addEventListener("click", openAccountDialog);
document.querySelector("#soundButton")?.addEventListener("click", toggleSoundPlayback);
document.querySelector("#soundFooterStopButton")?.addEventListener("click", () => {
  soundscape.stop();
  renderSoundDialog();
  if (state.tab === "read") renderReader();
  else if (state.tab === "write" || state.tab === "desk") renderContent();
});
document.querySelector("#soundChooseButton")?.addEventListener("click", openSoundDialog);
window.addEventListener("roshni:workspace-saved", queueCloudSync);

updateLockButton();
mountFireflies();
updateSoundButton();
renderCapsuleNote();

syncShellView();
renderContent();
renderReader();
refreshVoiceRecordings();

if (state.locked && workspace.settings.pinHash) configureLockDialog("unlock");

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    if (!state.playing) renderReader();
  });
}

bootstrapCloud();
