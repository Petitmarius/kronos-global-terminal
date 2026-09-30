import timeline from '../timeline.json';

// Brand tokens, lifted from frontend/src/styles/tokens.css so the promo
// speaks the exact visual language of the app.
export const C = {
  bg: '#06080B',
  bg2: '#0B0E11',
  panel: '#12161A',
  panel2: '#0E1217',
  border: '#1D2530',
  border2: '#252F3B',
  green: '#00E676',
  greenSoft: 'rgba(0, 230, 118, 0.14)',
  red: '#FF1744',
  amber: '#FF9100',
  gold: '#FFC24A',
  blue: '#42A5F5',
  text: '#F2F6FA',
  textDim: '#A7B4C2',
  muted: '#7C8A99',
  dim: '#4A5663',
} as const;

export const MONO = "'JetBrains Mono', ui-monospace, monospace";
export const DISPLAY = "'Inter Tight', 'Inter', system-ui, sans-serif";

export const FPS = timeline.fps;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = Math.round(timeline.duration * FPS);

/** One beat at 120 BPM = 30 frames at 60 fps. */
export const BEAT = Math.round((60 / timeline.bpm) * FPS);

/** Seconds → frames. */
export const f = (seconds: number) => Math.round(seconds * FPS);

export const T = timeline;

// The raw recordings are 1920x914 once the letterbox is cropped away.
export const SRC_W = 1920;
export const SRC_H = 914;
