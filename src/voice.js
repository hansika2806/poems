import { synthesizeCloudSpeech, synthesizeGoogleTranslate } from "./cloud.js";
import { readCloudAudio, writeCloudAudio } from "./media-store.js";

const GOOGLE_TRANSLATE_VOICES = [
  { name: "GoogleTranslate Hindi", lang: "hi", provider: "google-translate" },
  { name: "GoogleTranslate Urdu", lang: "ur", provider: "google-translate" },
  { name: "GoogleTranslate English", lang: "en", provider: "google-translate" }
];

const GOOGLE_CLOUD_VOICES = [
  { name: "hi-IN-Neural2-A", lang: "hi-IN", label: "Google Cloud Hindi · Neural2 A", provider: "google-cloud" },
  { name: "hi-IN-Neural2-B", lang: "hi-IN", label: "Google Cloud Hindi · Neural2 B", provider: "google-cloud" },
  { name: "hi-IN-Neural2-C", lang: "hi-IN", label: "Google Cloud Hindi · Neural2 C", provider: "google-cloud" },
  { name: "hi-IN-Neural2-D", lang: "hi-IN", label: "Google Cloud Hindi · Neural2 D", provider: "google-cloud" },
  { name: "hi-IN-Wavenet-A", lang: "hi-IN", label: "Google Cloud Hindi · Wavenet A", provider: "google-cloud" },
  { name: "hi-IN-Wavenet-D", lang: "hi-IN", label: "Google Cloud Hindi · Wavenet D", provider: "google-cloud" },
  { name: "en-IN-Neural2-A", lang: "en-IN", label: "Google Cloud English · Neural2 A", provider: "google-cloud" },
  { name: "en-IN-Wavenet-A", lang: "en-IN", label: "Google Cloud English · Wavenet A", provider: "google-cloud" }
];

let speechToken = 0;
let activeAudio = null;

export function listVoices() {
  const nativeVoices = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
  return [...GOOGLE_TRANSLATE_VOICES, ...GOOGLE_CLOUD_VOICES, ...nativeVoices.filter((voice) => ![...GOOGLE_TRANSLATE_VOICES, ...GOOGLE_CLOUD_VOICES].some((item) => item.name === voice.name))];
}

export function canSpeak() {
  return typeof window !== "undefined" && ("Audio" in window || ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window));
}

function isGoogleTranslateVoice(voiceName) {
  return GOOGLE_TRANSLATE_VOICES.some((voice) => voice.name === voiceName);
}

function cloudVoice(voiceName) {
  return GOOGLE_CLOUD_VOICES.find((voice) => voice.name === voiceName);
}

const CLOUD_REQUEST_BUDGET = 4600;
const CLOUD_AUDIO_CACHE = new Map();
const CLOUD_AUDIO_CACHE_LIMIT = 12;

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value).length;
}

function cloudSsmlBytes(lines, includeWordTimepoints = false) {
  const ssml = `<speak>${lines.map((line, index) => {
    const words = String(line).split(/\s+/).filter(Boolean);
    const text = includeWordTimepoints ? words.map((word, wordIndex) => `<mark name="word-${index}-${wordIndex}"/>${xmlEscape(word)}`).join(" ") : xmlEscape(line);
    return `<mark name="line-${index}"/>${text}${index < lines.length - 1 ? '<break time="350ms"/>' : ""}`;
  }).join(" ")}</speak>`;
  return utf8Bytes(ssml);
}

function splitOversizedCloudLine(line, includeWordTimepoints) {
  const words = String(line).split(/\s+/).filter(Boolean);
  const parts = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && cloudSsmlBytes([candidate], includeWordTimepoints) > CLOUD_REQUEST_BUDGET) {
      parts.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) parts.push(current);
  return parts.length ? parts : [line];
}

function cloudChunks(lines, includeWordTimepoints) {
  const chunks = [];
  let currentLines = [];
  let currentIndexes = [];
  const flush = () => {
    if (currentLines.length) chunks.push({ lines: currentLines, globalIndexes: currentIndexes });
    currentLines = [];
    currentIndexes = [];
  };
  const addOversizedLine = (line, globalIndex) => {
    splitOversizedCloudLine(line, includeWordTimepoints).forEach((part) => {
      if (cloudSsmlBytes([part], includeWordTimepoints) <= CLOUD_REQUEST_BUDGET) {
        chunks.push({ lines: [part], globalIndexes: [globalIndex] });
        return;
      }
      const characters = Array.from(part);
      let piece = "";
      characters.forEach((character) => {
        const next = `${piece}${character}`;
        if (piece && cloudSsmlBytes([next], includeWordTimepoints) > CLOUD_REQUEST_BUDGET) {
          chunks.push({ lines: [piece], globalIndexes: [globalIndex] });
          piece = character;
        } else {
          piece = next;
        }
      });
      if (piece) chunks.push({ lines: [piece], globalIndexes: [globalIndex] });
    });
  };

  lines.forEach((line, globalIndex) => {
    if (cloudSsmlBytes([line], includeWordTimepoints) > CLOUD_REQUEST_BUDGET) {
      flush();
      addOversizedLine(line, globalIndex);
      return;
    }
    const candidate = [...currentLines, line];
    if (currentLines.length && cloudSsmlBytes(candidate, includeWordTimepoints) > CLOUD_REQUEST_BUDGET) flush();
    currentLines.push(line);
    currentIndexes.push(globalIndex);
  });
  flush();
  return chunks;
}

async function synthesizeCachedCloudSpeech(input) {
  const key = JSON.stringify(input);
  if (CLOUD_AUDIO_CACHE.has(key)) return CLOUD_AUDIO_CACHE.get(key);
  const persisted = await readCloudAudio(key);
  if (persisted) {
    CLOUD_AUDIO_CACHE.set(key, persisted);
    return persisted;
  }
  const payload = await synthesizeCloudSpeech(input);
  CLOUD_AUDIO_CACHE.set(key, payload);
  writeCloudAudio(key, payload);
  while (CLOUD_AUDIO_CACHE.size > CLOUD_AUDIO_CACHE_LIMIT) CLOUD_AUDIO_CACHE.delete(CLOUD_AUDIO_CACHE.keys().next().value);
  return payload;
}

function stopAudio() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.removeAttribute("src");
  activeAudio.load();
  activeAudio = null;
}

export function stopSpeaking() {
  speechToken += 1;
  stopAudio();
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function pauseSpeaking() {
  if (activeAudio) activeAudio.pause();
  else if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.pause();
}

export function resumeSpeaking() {
  if (activeAudio) activeAudio.play().catch(() => undefined);
  else if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.resume();
}

function chunksForGoogle(line) {
  if (line.length <= 180) return [line];
  const words = line.split(/\s+/);
  const chunks = [];
  let current = "";
  words.forEach((word) => {
    if (current && `${current} ${word}`.length > 175) {
      chunks.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

function speakGoogleLines(lines, options) {
  const token = ++speechToken;
  stopAudio();
  if (typeof window === "undefined" || !("Audio" in window)) return false;
  const selectedVoice = GOOGLE_TRANSLATE_VOICES.find((voice) => voice.name === options.voiceName);
  const language = selectedVoice?.lang || options.lang?.split("-")[0] || "hi";

  let lineIndex = 0;
  let chunkIndex = 0;
  let chunks = chunksForGoogle(lines[0] || "");

  const playNext = () => {
    if (token !== speechToken) return;
    if (lineIndex >= lines.length) {
      activeAudio = null;
      options.onDone?.();
      return;
    }
    if (chunkIndex >= chunks.length) {
      lineIndex += 1;
      chunkIndex = 0;
      chunks = chunksForGoogle(lines[lineIndex] || "");
      playNext();
      return;
    }

    synthesizeGoogleTranslate({ text: chunks[chunkIndex], lang: language }).then((payload) => {
      if (token !== speechToken || !payload.audioUrl) return;
      const audio = new Audio(payload.audioUrl);
      activeAudio = audio;
      audio.preload = "auto";
      audio.playbackRate = Number(options.rate || 0.82);
      audio.onplay = () => {
        if (token === speechToken && chunkIndex === 0) options.onLineStart?.(lineIndex);
      };
      audio.onended = () => {
        if (token !== speechToken) return;
        chunkIndex += 1;
        playNext();
      };
      audio.onerror = () => {
        if (token === speechToken) {
          activeAudio = null;
          options.onError?.(new Error("The voice audio could not be played."));
        }
      };
      audio.play().catch((error) => {
        if (token === speechToken) {
          activeAudio = null;
          options.onError?.(error);
        }
      });
    }).catch((error) => {
      if (token === speechToken) options.onError?.(error);
    });
  };

  playNext();
  return true;
}

function speakCloudLines(lines, options) {
  const token = ++speechToken;
  stopAudio();
  const voice = cloudVoice(options.voiceName);
  if (!voice) return false;
  const includeWordTimepoints = true;
  const chunks = cloudChunks(lines, includeWordTimepoints);
  let chunkIndex = 0;
  let elapsedSeconds = 0;
  const captions = [];

  const playNextChunk = () => {
    if (token !== speechToken) return;
    if (chunkIndex >= chunks.length) {
      activeAudio = null;
      options.onDone?.();
      return;
    }
    const chunk = chunks[chunkIndex];
    synthesizeCachedCloudSpeech({
      lines: chunk.lines,
      voiceName: voice.name,
      languageCode: voice.lang,
      speakingRate: Number(options.rate || 0.82),
      pitch: (Number(options.pitch || 0.95) - 1) * 8,
      includeWordTimepoints
    }).then((payload) => {
      if (token !== speechToken || !payload.audioContent) return;
      const audio = new Audio(`data:audio/mpeg;base64,${payload.audioContent}`);
      const lineTimepoints = [];
      const events = (payload.timepoints || []).map((point) => {
        const markName = String(point.markName || "");
        const seconds = Number(point.timeSeconds || 0);
        if (markName.startsWith("line-")) {
          const localIndex = Number(markName.slice(5));
          if (Number.isInteger(localIndex) && chunk.globalIndexes[localIndex] !== undefined) {
            const linePoint = { type: "line", localIndex, seconds };
            lineTimepoints.push(linePoint);
            return linePoint;
          }
        }
        if (markName.startsWith("word-")) {
          const [, localValue, wordValue] = markName.split("-");
          const localIndex = Number(localValue);
          const wordIndex = Number(wordValue);
          if (Number.isInteger(localIndex) && Number.isInteger(wordIndex) && chunk.globalIndexes[localIndex] !== undefined) return { type: "word", localIndex, wordIndex, seconds };
        }
        return null;
      }).filter(Boolean).sort((a, b) => a.seconds - b.seconds);
      lineTimepoints.sort((a, b) => a.seconds - b.seconds);
      let nextTimepoint = 0;
      let lastGlobalIndex = null;
      activeAudio = audio;
      audio.preload = "auto";
      const dispatchTimepoint = (point) => {
        const globalIndex = chunk.globalIndexes[point.localIndex];
        if (point.type === "line") {
          if (globalIndex !== lastGlobalIndex) options.onLineStart?.(globalIndex);
          lastGlobalIndex = globalIndex;
        } else {
          options.onWordStart?.(globalIndex, point.wordIndex);
        }
      };
      audio.onplay = () => {
        if (token !== speechToken) return;
        lastGlobalIndex = chunk.globalIndexes[0];
        options.onLineStart?.(lastGlobalIndex);
        while (nextTimepoint < events.length && events[nextTimepoint].seconds <= 0.05) {
          dispatchTimepoint(events[nextTimepoint]);
          nextTimepoint += 1;
        }
      };
      audio.ontimeupdate = () => {
        while (token === speechToken && nextTimepoint < events.length && audio.currentTime >= events[nextTimepoint].seconds) {
          dispatchTimepoint(events[nextTimepoint]);
          nextTimepoint += 1;
        }
      };
      audio.onended = () => {
        if (token !== speechToken) return;
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Math.max(0.5, lineTimepoints.at(-1)?.seconds || 0.5);
        const chunkCaptions = lineTimepoints.map((point, index) => ({
          index: chunk.globalIndexes[point.localIndex],
          text: lines[chunk.globalIndexes[point.localIndex]],
          start: elapsedSeconds + point.seconds,
          end: elapsedSeconds + (lineTimepoints[index + 1]?.seconds ?? duration)
        }));
        captions.push(...chunkCaptions);
        elapsedSeconds += duration;
        options.onCaptions?.([...captions], chunkIndex === chunks.length - 1);
        activeAudio = null;
        chunkIndex += 1;
        playNextChunk();
      };
      audio.onerror = () => {
        if (token === speechToken) {
          activeAudio = null;
          options.onError?.(new Error("The cloud voice audio could not be played."));
        }
      };
      audio.play().catch((error) => {
        if (token === speechToken) {
          activeAudio = null;
          options.onError?.(error);
        }
      });
    }).catch((error) => {
      if (token === speechToken) options.onError?.(error);
    });
  };

  playNextChunk();
  return true;
}

function speakBrowserLines(lines, options) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
  const token = ++speechToken;
  window.speechSynthesis.cancel();
  let completed = 0;
  const nativeVoice = listVoices().find((voice) => voice.name === options.voiceName && !voice.provider);

  lines.forEach((line, index) => {
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = options.lang || "en-IN";
    utterance.rate = Number(options.rate || 0.82);
    utterance.pitch = Number(options.pitch || 0.95);
    if (nativeVoice) utterance.voice = nativeVoice;
    utterance.onstart = () => {
      if (token === speechToken) options.onLineStart?.(index);
    };
    utterance.onend = () => {
      completed += 1;
      if (token === speechToken && completed === lines.length) options.onDone?.();
    };
    utterance.onerror = (event) => {
      if (token === speechToken) options.onError?.(new Error(event.error || "Browser speech could not continue."));
    };
    window.speechSynthesis.speak(utterance);
  });

  return true;
}

export function speakLines(lines, options = {}) {
  if (!lines?.length || !canSpeak()) return false;
  stopSpeaking();
  if (isGoogleTranslateVoice(options.voiceName)) return speakGoogleLines(lines, options);
  if (cloudVoice(options.voiceName)) return speakCloudLines(lines, options);
  return speakBrowserLines(lines, options);
}
