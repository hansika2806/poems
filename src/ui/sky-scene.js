const MOON_CYCLE = 29.530588853;
const MOON_REFERENCE = Date.UTC(2000, 0, 6, 18, 14);

const TIME_SCENES = [
  { id: "night", start: 0, end: 5, eyebrow: "the quietest hour", title: "Some thoughts", accent: "arrive as stars.", note: "A sky for the things you almost forgot to say." },
  { id: "dawn", start: 5, end: 11, eyebrow: "the day opening slowly", title: "Keep the light", accent: "beside you.", note: "A small place for words before the day becomes loud." },
  { id: "afternoon", start: 11, end: 17, eyebrow: "the middle of the day", title: "Leave a line", accent: "for later.", note: "The page can hold what the hour cannot." },
  { id: "evening", start: 17, end: 24, eyebrow: "the blue hour", title: "Let the room", accent: "turn inward.", note: "A softer sky for the words that return at night." }
];

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function hash(value) {
  return [...String(value)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sceneForHour(hour) {
  return TIME_SCENES.find((scene) => hour >= scene.start && hour < scene.end) || TIME_SCENES[0];
}

function moonPhase(date) {
  const elapsed = (date.getTime() - MOON_REFERENCE) / 86400000;
  return ((elapsed % MOON_CYCLE) + MOON_CYCLE) % MOON_CYCLE / MOON_CYCLE;
}

function moonLabel(phase) {
  if (phase < 0.04 || phase > 0.96) return "new moon";
  if (phase < 0.24) return "waxing crescent";
  if (phase < 0.28) return "first quarter";
  if (phase < 0.49) return "waxing gibbous";
  if (phase < 0.54) return "full moon";
  if (phase < 0.74) return "waning gibbous";
  if (phase < 0.78) return "last quarter";
  return "waning crescent";
}

function moonStyle(phase) {
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const shadowWidth = (1 - illumination) * 62;
  const shadowLeft = phase < 0.5 ? 0 : 62 - shadowWidth;
  return `--moon-shadow-left:${shadowLeft.toFixed(2)}px;--moon-shadow-width:${shadowWidth.toFixed(2)}px`;
}

function positionFor(snippet, index, total) {
  const seed = hash(snippet.id);
  const fallbackX = 0.52 + ((seed % 37) / 100);
  const fallbackY = 0.25 + (((seed >>> 5) % 57) / 100);
  const spread = total > 8 ? 0.92 : 1;
  return {
    x: clamp(Number.isFinite(Number(snippet.x)) ? Number(snippet.x) : fallbackX + index * 0.02, 0.18, 0.92) * spread,
    y: clamp(Number.isFinite(Number(snippet.y)) ? Number(snippet.y) : fallbackY, 0.18, 0.83),
    delay: `${(seed % 2800) / 1000}s`
  };
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function constellationLinks(snippets, positions) {
  const links = [];
  const byPoem = new Map();
  snippets.forEach((snippet, index) => {
    if (!snippet.poemId) return;
    const group = byPoem.get(snippet.poemId) || [];
    group.push(index);
    byPoem.set(snippet.poemId, group);
  });
  byPoem.forEach((indexes) => {
    for (let index = 1; index < indexes.length; index += 1) {
      const from = positions[indexes[index - 1]];
      const to = positions[indexes[index]];
      const dx = (to.x - from.x) * 100;
      const dy = (to.y - from.y) * 100;
      const length = Math.sqrt((dx * dx) + (dy * dy));
      if (length < 30) links.push(`<span class="sky-link" style="left:${from.x * 100}%;top:${from.y * 100}%;width:${length}%;transform:rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)"></span>`);
    }
  });
  return links.join("");
}

export function renderMoonlitScene(snippets, date = new Date()) {
  const scene = sceneForHour(date.getHours());
  const phase = moonPhase(date);
  const visibleSnippets = snippets.filter((snippet) => snippet.id !== "new" && snippet.title).slice(0, 24);
  const positions = visibleSnippets.map(positionFor);
  const stars = visibleSnippets.map((snippet, index) => {
    const position = positions[index];
    const title = escapeHtml(snippet.title);
    const meta = escapeHtml(snippet.time || snippet.mood || "a thought");
    return `<button class="sky-star mood-${escapeHtml(snippet.mood || "tender")}" data-snippet="${escapeHtml(snippet.id)}" aria-label="Open ${title}" style="left:${position.x * 100}%;top:${position.y * 100}%;--star-delay:${position.delay}"><span class="sky-star-core"></span><span class="sky-star-note"><strong>${title}</strong><small>${meta}</small></span></button>`;
  }).join("");
  const links = constellationLinks(visibleSnippets, positions);
  return `<div class="moonlit-scene scene-${scene.id}" data-scene="${scene.id}"><div class="sky-noise"></div><div class="sky-stars" aria-label="Your thought constellation">${links}${stars || `<p class="sky-empty">The first star is waiting for a line.</p>`}</div><div class="sky-moon" style="--moon-phase:${phase}" role="img" aria-label="${moonLabel(phase)}"><span style="${moonStyle(phase)}"></span><small>${moonLabel(phase)}</small></div><div class="sky-horizon"></div></div>`;
}

export function renderMoonlitCopy(date = new Date()) {
  const scene = sceneForHour(date.getHours());
  return { ...scene, dateLabel: formatDate(date) };
}
