import { Easing } from 'remotion';

export const ease = {
  linear: (t: number) => t,
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  inExpo: Easing.bezier(0.7, 0, 0.84, 0),
  inOutExpo: Easing.bezier(0.87, 0, 0.13, 1),
  outCubic: Easing.bezier(0.33, 1, 0.68, 1),
  inCubic: Easing.bezier(0.32, 0, 0.67, 0),
  inOutCubic: Easing.bezier(0.65, 0, 0.35, 1),
  inOutQuart: Easing.bezier(0.76, 0, 0.24, 1),
  outBack: Easing.bezier(0.34, 1.56, 0.64, 1),
  outQuint: Easing.bezier(0.22, 1, 0.36, 1),
  inOutSine: Easing.bezier(0.37, 0, 0.63, 1),
  /** gentle start, long glide: for camera pull-backs that follow a settled shot */
  pull: Easing.bezier(0.45, 0, 0.12, 1),
};

export type EaseFn = (t: number) => number;

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Normalised, eased progress of `frame` through [start, start + duration]. */
export const prog = (frame: number, start: number, duration: number, e: EaseFn = ease.outExpo) =>
  e(clamp((frame - start) / Math.max(1, duration)));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Keyframed value with a per-segment easing: keys are [frame, value, easing
 * used to arrive at this key]. Holds the first/last value outside the range.
 */
export type Key = [number, number, EaseFn?];
export const kf = (frame: number, keys: Key[]): number => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0] = keys[i];
    const [f1, v1, e] = keys[i + 1];
    if (frame <= f1) {
      const t = f1 === f0 ? 1 : (frame - f0) / (f1 - f0);
      return v0 + (v1 - v0) * (e ?? ease.inOutCubic)(t);
    }
  }
  return keys[keys.length - 1][1];
};

/** Speed of a keyframed track in units per frame (for motion blur). */
export const kfSpeed = (frame: number, keys: Key[]) => Math.abs(kf(frame + 0.5, keys) - kf(frame - 0.5, keys));

/** Decaying "punch" that fires on each trigger frame (beat hits, impacts). */
export const punch = (frame: number, triggers: number[], length = 12, e: EaseFn = ease.outCubic) => {
  let v = 0;
  for (const t of triggers) {
    if (frame >= t && frame < t + length) v = Math.max(v, 1 - e((frame - t) / length));
  }
  return v;
};

/** Deterministic hash-based random in [0, 1). */
export const rand = (...seed: number[]) => {
  let h = 2166136261;
  for (const s of seed) {
    h ^= Math.floor(s * 1000003) | 0;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
