const SOUND_PATHS = {
  Studio: ["alarm.mp3", "silence.wav"],
  Animals: [
    "animals/beehive.mp3", "animals/birds.mp3", "animals/cat-purring.mp3", "animals/chickens.mp3",
    "animals/cows.mp3", "animals/crickets.mp3", "animals/crows.mp3", "animals/dog-barking.mp3",
    "animals/frog.mp3", "animals/horse-gallop.mp3", "animals/owl.mp3", "animals/seagulls.mp3",
    "animals/sheep.mp3", "animals/whale.mp3", "animals/wolf.mp3", "animals/woodpecker.mp3"
  ],
  Binaural: ["binaural/binaural-alpha.wav", "binaural/binaural-beta.wav", "binaural/binaural-delta.wav", "binaural/binaural-gamma.wav", "binaural/binaural-theta.wav"],
  Nature: [
    "nature/campfire.mp3", "nature/droplets.mp3", "nature/howling-wind.mp3", "nature/jungle.mp3",
    "nature/river.mp3", "nature/walk-in-snow.mp3", "nature/walk-on-gravel.mp3", "nature/walk-on-leaves.mp3",
    "nature/waterfall.mp3", "nature/waves.mp3", "nature/wind-in-trees.mp3", "nature/wind.mp3"
  ],
  Noise: ["noise/brown-noise.wav", "noise/pink-noise.wav", "noise/white-noise.wav"],
  Places: [
    "places/airport.mp3", "places/cafe.mp3", "places/carousel.mp3", "places/church.mp3",
    "places/construction-site.mp3", "places/crowded-bar.mp3", "places/laboratory.mp3", "places/laundry-room.mp3",
    "places/library.mp3", "places/night-village.mp3", "places/office.mp3", "places/restaurant.mp3",
    "places/subway-station.mp3", "places/supermarket.mp3", "places/temple.mp3", "places/underwater.mp3"
  ],
  Rain: [
    "rain/heavy-rain.mp3", "rain/light-rain.mp3", "rain/rain-on-car-roof.mp3", "rain/rain-on-leaves.mp3",
    "rain/rain-on-tent.mp3", "rain/rain-on-umbrella.mp3", "rain/rain-on-window.mp3", "rain/thunder.mp3"
  ],
  Things: [
    "things/boiling-water.mp3", "things/bubbles.mp3", "things/ceiling-fan.mp3", "things/clock.mp3",
    "things/dryer.mp3", "things/keyboard.mp3", "things/morse-code.mp3", "things/paper.mp3",
    "things/singing-bowl.mp3", "things/slide-projector.mp3", "things/tuning-radio.mp3", "things/typewriter.mp3",
    "things/vinyl-effect.mp3", "things/washing-machine.mp3", "things/wind-chimes.mp3", "things/windshield-wipers.mp3"
  ],
  Transport: ["transport/airplane.mp3", "transport/inside-a-train.mp3", "transport/rowing-boat.mp3", "transport/sailboat.mp3", "transport/submarine.mp3", "transport/train.mp3"],
  Urban: ["urban/ambulance-siren.mp3", "urban/busy-street.mp3", "urban/crowd.mp3", "urban/fireworks.mp3", "urban/highway.mp3", "urban/road.mp3", "urban/traffic.mp3"]
};

function titleFromPath(path) {
  return path.split("/").pop().replace(/\.[^.]+$/, "").split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function idFromPath(path) {
  return path.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

export const SOUND_LIBRARY = Object.entries(SOUND_PATHS).flatMap(([category, paths]) => paths.map((path) => ({
  id: idFromPath(path),
  label: titleFromPath(path),
  category,
  path,
  src: `assets/sounds/moodist/${path}`
})));

const soundByPath = new Map(SOUND_LIBRARY.map((sound) => [sound.path, sound]));

export const SOUND_PRESETS = [
  { id: "rain-window", label: "Rain on the Window", note: "A wet pane, a little wind, a room that stays awake.", paths: [["rain/rain-on-window.mp3", 0.34], ["nature/wind-in-trees.mp3", 0.18]] },
  { id: "library-night", label: "Library at Night", note: "Pages, low air, and the hush between two lines.", paths: [["places/library.mp3", 0.3], ["things/ceiling-fan.mp3", 0.16]] },
  { id: "paper-ink", label: "Paper and Ink", note: "The desk is ready before the first word arrives.", paths: [["things/paper.mp3", 0.3], ["things/typewriter.mp3", 0.2], ["things/vinyl-effect.mp3", 0.08]] },
  { id: "train-thought", label: "Train of Thought", note: "A moving window for poems that cannot sit still.", paths: [["transport/inside-a-train.mp3", 0.28], ["rain/rain-on-window.mp3", 0.16]] },
  { id: "quiet-morning", label: "Quiet Morning", note: "Birdsong, water, and the first kind thought of the day.", paths: [["animals/birds.mp3", 0.22], ["nature/river.mp3", 0.2], ["things/wind-chimes.mp3", 0.1]] },
  { id: "mushaira-evening", label: "Mushaira Evening", note: "A village night, a singing bowl, and words spoken slowly.", paths: [["places/night-village.mp3", 0.24], ["things/singing-bowl.mp3", 0.11], ["nature/wind.mp3", 0.12]] },
  { id: "monsoon-roof", label: "Monsoon Roof", note: "Heavy rain with a little thunder at the edge of the page.", paths: [["rain/heavy-rain.mp3", 0.25], ["rain/thunder.mp3", 0.08], ["rain/rain-on-tent.mp3", 0.18]] },
  { id: "cafe-draft", label: "Cafe Draft", note: "A poem drafted among cups, chairs, and distant voices.", paths: [["places/cafe.mp3", 0.26], ["things/keyboard.mp3", 0.12]] }
];

export function presetMix(presetId) {
  const preset = SOUND_PRESETS.find((item) => item.id === presetId);
  if (!preset) return {};
  return Object.fromEntries(preset.paths.map(([path, volume]) => [soundByPath.get(path)?.id, volume]).filter(([id]) => id));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function createSoundscape({ initialMix = {}, onChange, onError } = {}) {
  const mix = new Map(Object.entries(initialMix).map(([id, volume]) => [id, clamp(volume)]));
  const tracks = new Map();
  let playing = false;

  function notify() {
    onChange?.(getMix(), playing);
  }

  function getMix() {
    return Object.fromEntries([...mix.entries()].filter(([, volume]) => volume > 0));
  }

  function getTrack(id) {
    if (tracks.has(id)) return tracks.get(id);
    const sound = SOUND_LIBRARY.find((item) => item.id === id);
    if (!sound) return null;
    const audio = new Audio(sound.src);
    audio.loop = true;
    audio.preload = "none";
    audio.volume = 0;
    const track = { audio, fadeId: 0, sound };
    tracks.set(id, track);
    return track;
  }

  function fadeTo(track, target, duration = 420) {
    cancelAnimationFrame(track.fadeId);
    const start = track.audio.volume;
    const began = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - began) / duration);
      track.audio.volume = start + ((target - start) * progress);
      if (progress < 1) track.fadeId = requestAnimationFrame(tick);
    };
    track.fadeId = requestAnimationFrame(tick);
  }

  function startTrack(id) {
    const track = getTrack(id);
    if (!track) return;
    const volume = mix.get(id) || 0;
    track.audio.volume = Math.min(track.audio.volume, volume);
    track.audio.play().catch((error) => onError?.(error));
    fadeTo(track, volume);
  }

  function stopTrack(id, reset = false) {
    const track = tracks.get(id);
    if (!track) return;
    fadeTo(track, 0);
    window.setTimeout(() => {
      if (track.audio.volume > 0.01) return;
      track.audio.pause();
      if (reset) track.audio.currentTime = 0;
    }, 450);
  }

  function syncTrack(id) {
    if (playing && mix.has(id)) startTrack(id);
    else stopTrack(id);
  }

  function applyMix(nextMix) {
    const next = new Map(Object.entries(nextMix).map(([id, volume]) => [id, clamp(volume)]));
    for (const id of new Set([...mix.keys(), ...next.keys()])) {
      if (next.has(id)) mix.set(id, next.get(id));
      else mix.delete(id);
      syncTrack(id);
    }
    notify();
  }

  return {
    applyMix,
    getMix,
    getVolume: (id) => mix.get(id) || 0,
    isSelected: (id) => mix.has(id),
    isPlaying: () => playing,
    play() {
      playing = true;
      for (const id of mix.keys()) startTrack(id);
      notify();
    },
    pause() {
      playing = false;
      for (const id of tracks.keys()) tracks.get(id).audio.pause();
      notify();
    },
    stop() {
      playing = false;
      for (const id of tracks.keys()) stopTrack(id, true);
      notify();
    },
    setSelected(id, selected) {
      if (selected) mix.set(id, mix.get(id) || 0.24);
      else mix.delete(id);
      syncTrack(id);
      notify();
    },
    setVolume(id, volume) {
      if (!mix.has(id)) return;
      mix.set(id, clamp(volume));
      if (playing) startTrack(id);
      notify();
    }
  };
}
