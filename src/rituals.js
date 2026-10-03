export const TONIGHT_FEELINGS = [
  { id: "restless", label: "restless" },
  { id: "missing", label: "missing someone" },
  { id: "hopeful", label: "hopeful" },
  { id: "tender", label: "tender" }
];

export function capsuleIsUnlocked(capsule, now = Date.now()) {
  return Number(capsule?.unlockAt) <= now;
}

export function capsuleDateLabel(timestamp) {
  return new Date(Number(timestamp)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toLowerCase();
}

export function dayKey(date = new Date()) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function poemOfTheDay(poems, date = new Date()) {
  const mine = poems.filter((poem) => poem.lines?.length);
  if (!mine.length) return null;
  const seed = [...dayKey(date)].reduce((total, character) => total + character.charCodeAt(0), 0);
  return mine[seed % mine.length];
}

export function poemForFeeling(poems, feeling) {
  const aliases = { missing: ["restless", "tender"], hopeful: ["hopeful"], restless: ["restless"], tender: ["tender"] };
  const preferred = aliases[feeling] || [feeling];
  return poems.find((poem) => preferred.includes(poem.mood) && poem.lines?.length) || poems.find((poem) => poem.lines?.length) || null;
}

export function yearRecap(poems, snippets, readCounts = {}, year = new Date().getFullYear()) {
  const yearText = String(year);
  const inYear = poems.filter((poem) => String(poem.date || "").includes(yearText) || poem.userCreated);
  const moodCounts = inYear.reduce((counts, poem) => {
    counts[poem.mood] = (counts[poem.mood] || 0) + 1;
    return counts;
  }, {});
  const mostRead = [...poems].sort((a, b) => Number(readCounts[b.id] || 0) - Number(readCounts[a.id] || 0))[0] || poems[0];
  const poetCounts = poems.filter((poem) => poem.owner === "collected" && poem.poet).reduce((counts, poem) => {
    counts[poem.poet] = (counts[poem.poet] || 0) + 1;
    return counts;
  }, {});
  const topPoet = Object.entries(poetCounts).sort((a, b) => b[1] - a[1])[0];
  const totalWords = inYear.reduce((total, poem) => total + (poem.lines || []).join(" ").split(/\s+/).filter(Boolean).length, 0);
  return {
    year,
    poemsWritten: inYear.filter((poem) => poem.owner === "mine").length,
    poemsCollected: inYear.filter((poem) => poem.owner === "collected").length,
    snippets: snippets.filter((snippet) => String(snippet.time || "").includes(yearText) || snippet.userCreated).length,
    totalWords,
    moodCounts,
    mostRead,
    mostReadCount: Number(readCounts[mostRead?.id] || 0),
    topPoet: topPoet?.[0] || "the poets you keep",
    topPoetCount: topPoet?.[1] || 0
  };
}

export function createShareCard(poem, lines, options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const context = canvas.getContext("2d");
  const paper = context.createLinearGradient(0, 0, 1200, 1500);
  paper.addColorStop(0, "#fbf8f1");
  paper.addColorStop(1, "#e9dfcf");
  context.fillStyle = paper;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(20,36,61,.16)";
  context.lineWidth = 2;
  context.strokeRect(45, 45, 1110, 1410);
  context.fillStyle = "#d4912b";
  context.font = "20px monospace";
  context.letterSpacing = "3px";
  context.fillText("ROSHNI AUR LAFZ", 90, 125);
  context.fillStyle = "#14243d";
  context.font = "42px Georgia, serif";
  context.fillText(poem.title, 90, 210);
  context.font = "34px Kalam, cursive";
  const selectedLines = lines.slice(0, 4);
  selectedLines.forEach((line, index) => context.fillText(line, 120 + (index % 2 ? 52 : 0), 430 + index * 78));
  context.strokeStyle = "rgba(212,145,43,.45)";
  context.beginPath();
  context.moveTo(90, 815);
  context.lineTo(1110, 815);
  context.stroke();
  context.fillStyle = "#425066";
  context.font = "20px Georgia, serif";
  context.fillText(options.footer || "a line worth carrying home", 90, 900);
  context.fillStyle = "#72816b";
  context.font = "78px Georgia, serif";
  context.fillText("✦", 1010, 1325);
  context.fillStyle = "#425066";
  context.font = "16px monospace";
  context.fillText("paper / ink / weather", 90, 1380);
  return canvas.toDataURL("image/png");
}
