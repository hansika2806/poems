let activeRecognition = null;

export function cleanPoemText(value) {
  const normalized = String(value || "").replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ");
  const rawLines = normalized.split("\n").map((line) => line.trim().replace(/^(?:\d+[.)]|[-*•])\s*/, "")).filter((line) => line || "");
  const lines = [];
  rawLines.forEach((line) => {
    if (!line) {
      if (lines.length && lines.at(-1) !== "") lines.push("");
      return;
    }
    lines.push(line.replace(/\s+([,.;:!?।،؛؟])/g, "$1"));
  });
  while (lines.at(-1) === "") lines.pop();
  return lines.join("\n");
}

export function formatCouplets(value) {
  const lines = cleanPoemText(value).split("\n").filter(Boolean);
  const formatted = [];
  lines.forEach((line, index) => {
    formatted.push(line);
    if (index % 2 === 1 && index < lines.length - 1) formatted.push("");
  });
  return formatted.join("\n");
}

export function speechRecognitionSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function startSpeechCapture({ lang = "hi-IN", onText, onStart, onEnd, onError } = {}) {
  if (!speechRecognitionSupported()) {
    onError?.(new Error("Speech-to-text is not available in this browser."));
    return false;
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  activeRecognition = new Recognition();
  activeRecognition.lang = lang;
  activeRecognition.continuous = true;
  activeRecognition.interimResults = true;
  activeRecognition.onstart = () => onStart?.();
  activeRecognition.onresult = (event) => {
    const transcript = Array.from(event.results).slice(event.resultIndex).map((result) => result[0]?.transcript || "").join(" ");
    onText?.(transcript, Array.from(event.results).some((result) => !result.isFinal));
  };
  activeRecognition.onerror = (event) => onError?.(new Error(event.error || "Speech-to-text could not continue."));
  activeRecognition.onend = () => {
    activeRecognition = null;
    onEnd?.();
  };
  activeRecognition.start();
  return true;
}

export function stopSpeechCapture() {
  activeRecognition?.stop();
}
