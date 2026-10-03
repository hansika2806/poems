const RHYME_COLORS = ["marigold", "rose", "moss", "rain"];

export const STARTER_GLOSSARY = [
  { word: "मरहम", meaning: "a balm; something that eases an ache", language: "Hindi", poemId: "window-light" },
  { word: "خاموشی", meaning: "silence; the quiet that remains", language: "Urdu", poemId: "the-last-train" },
  { word: "धूप", meaning: "sunlight; warmth falling into a room", language: "Hindi", poemId: "borrowed-sun" },
  { word: "ادھار", meaning: "borrowed; held for a while, then returned", language: "Urdu", poemId: "borrowed-sun" }
];

function cleanEnd(value) {
  return String(value || "").trim().replace(/[\s.,!?;:،۔؟!]+$/gu, "");
}

function endingKey(word) {
  const characters = Array.from(word.toLocaleLowerCase());
  return characters.slice(-3).join("") || word;
}

export function analyzeRhyme(lines = []) {
  const endings = lines.map((line, index) => {
    const words = String(line).trim().split(/\s+/).filter(Boolean);
    const word = cleanEnd(words.at(-1) || "");
    return { index, word, key: endingKey(word) };
  });
  const wordCounts = new Map();
  endings.forEach((ending) => wordCounts.set(ending.word.toLocaleLowerCase(), (wordCounts.get(ending.word.toLocaleLowerCase()) || 0) + 1));
  const radif = [...wordCounts.entries()].find(([, count]) => count > 1)?.[0] || "";
  const groups = new Map();
  endings.forEach((ending) => {
    if (!ending.key) return;
    if (!groups.has(ending.key)) groups.set(ending.key, []);
    groups.get(ending.key).push(ending.index);
  });
  const meaningfulGroups = [...groups.entries()].filter(([, indexes]) => indexes.length > 1);
  const colorByIndex = new Map();
  meaningfulGroups.forEach(([, indexes], groupIndex) => indexes.forEach((index) => colorByIndex.set(index, RHYME_COLORS[groupIndex % RHYME_COLORS.length])));
  return { endings, radif, groups: meaningfulGroups, colorByIndex };
}

export function glossaryForPoem(poem, customEntries = []) {
  return [...STARTER_GLOSSARY, ...customEntries].filter((entry) => entry.poemId === poem.id);
}

export function seedsForPoem(poemId, snippets = []) {
  return snippets.filter((snippet) => snippet.poemId === poemId && snippet.id !== "new");
}
