import { readVoiceRecording, writeVoiceRecording } from "./media-store.js";

let activeRecorder = null;
let activeStream = null;
let activeChunks = [];

export function recordingSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

function recordingMimeType() {
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export async function startVoiceRecording(key, { onStart, onStop, onError } = {}) {
  if (!recordingSupported()) {
    onError?.(new Error("Voice recording is not available in this browser."));
    return false;
  }
  if (activeRecorder) return true;
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = recordingMimeType();
    activeRecorder = mimeType ? new MediaRecorder(activeStream, { mimeType }) : new MediaRecorder(activeStream);
    activeChunks = [];
    activeRecorder.ondataavailable = (event) => {
      if (event.data.size) activeChunks.push(event.data);
    };
    activeRecorder.onerror = () => onError?.(new Error("The voice recording could not continue."));
    activeRecorder.onstop = async () => {
      const recorder = activeRecorder;
      const blob = new Blob(activeChunks, { type: recorder?.mimeType || mimeType || "audio/webm" });
      activeStream?.getTracks().forEach((track) => track.stop());
      activeRecorder = null;
      activeStream = null;
      activeChunks = [];
      await writeVoiceRecording(key, blob);
      onStop?.(blob);
    };
    activeRecorder.start();
    onStart?.();
    return true;
  } catch (error) {
    activeStream?.getTracks().forEach((track) => track.stop());
    activeRecorder = null;
    activeStream = null;
    activeChunks = [];
    onError?.(error);
    return false;
  }
}

export function stopVoiceRecording() {
  if (activeRecorder && activeRecorder.state !== "inactive") activeRecorder.stop();
}

export async function loadVoiceRecording(key) {
  return readVoiceRecording(key);
}
