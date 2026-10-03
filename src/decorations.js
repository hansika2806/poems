export const DECORATION_LIBRARY = [
  { id: "pressed-flower", label: "pressed flower", src: "assets/scrapbook/pressed-flower.svg", kind: "flower" },
  { id: "leaf-sprig", label: "leaf sprig", src: "assets/scrapbook/leaf-sprig.svg", kind: "leaf" },
  { id: "ink-wash", label: "ink wash", src: "assets/scrapbook/ink-wash.svg", kind: "wash" },
  { id: "washi-tape", label: "washi tape", src: "assets/scrapbook/washi-tape.svg", kind: "tape" },
  { id: "moon-stamp", label: "moon stamp", src: "assets/scrapbook/moon-stamp.svg", kind: "stamp" },
  { id: "rain-lines", label: "rain lines", src: "assets/scrapbook/rain-lines.svg", kind: "rain" },
  { id: "crescent-moon", label: "crescent moon", src: "assets/scrapbook/crescent-moon.svg", kind: "moon" },
  { id: "gold-star", label: "gold star", src: "assets/scrapbook/gold-star.svg", kind: "star" },
  { id: "ink-heart", label: "ink heart", src: "assets/scrapbook/ink-heart.svg", kind: "heart" },
  { id: "candle-light", label: "candle", src: "assets/scrapbook/candle-light.svg", kind: "candle" },
  { id: "quill-feather", label: "quill", src: "assets/scrapbook/quill-feather.svg", kind: "feather" },
  { id: "ink-drop", label: "ink drop", src: "assets/scrapbook/ink-drop.svg", kind: "drop" },
  { id: "page-bookmark", label: "bookmark", src: "assets/scrapbook/page-bookmark.svg", kind: "bookmark" },
  { id: "bird-branch", label: "bird branch", src: "assets/scrapbook/bird-branch.svg", kind: "bird" },
  { id: "mountain-horizon", label: "mountain", src: "assets/scrapbook/mountain-horizon.svg", kind: "mountain" },
  { id: "cloud-drift", label: "cloud drift", src: "assets/scrapbook/cloud-drift.svg", kind: "cloud" },
  { id: "paper-boat", label: "paper boat", src: "assets/scrapbook/paper-boat.svg", kind: "boat" },
];

export const STANZA_ART = ["ink-wash", "pressed-flower", "leaf-sprig", "rain-lines"];

export function decorationAsset(assetId) {
  return DECORATION_LIBRARY.find((asset) => asset.id === assetId) || DECORATION_LIBRARY[0];
}

export function normalizeDecorations(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    id: String(item.id || `decoration-${index}`),
    assetId: decorationAsset(item.assetId).id,
    x: clamp(Number(item.x), 4, 96, 50),
    y: clamp(Number(item.y), 4, 96, 50),
    scale: clamp(Number(item.scale), 0.25, 3.5, 1),
    rotation: clamp(Number(item.rotation), -180, 180, 0),
    z: Number.isFinite(Number(item.z)) ? Number(item.z) : index
  }));
}

function clamp(value, minimum, maximum, fallback) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
