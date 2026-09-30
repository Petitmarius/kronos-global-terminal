import { clamp, ease, lerp, rand } from './anim';
import { SCRAMBLE } from './glyphs';

export type SlotGlyph = { ch: string; x: number; y: number; blur: number; key: string; landed: boolean };

/**
 * Slot-machine reel for one letter cell. On each change the cell's strip
 * spins up by `slots` glyphs — the old letter, a few random ones, then the
 * new letter — so letters never overlap, and a velocity-scaled vertical
 * blur sells the spin.
 */
export const reel = (opts: {
  frame: number;
  cell: number;
  changes: number[]; // frames where each word should have landed
  glyphAt: (word: number) => string | undefined; // this cell's letter in each word
  xAt: (word: number) => number; // this cell's x in each word's layout
  slot: number; // px between glyphs on the strip
  slots?: number;
  duration?: number;
  lead?: number;
  stagger?: number;
  seed?: number;
}): SlotGlyph[] => {
  const { frame, cell, changes, glyphAt, xAt, slot, slots = 3, duration = 15, lead = 6, stagger = 1.7, seed = 0 } = opts;
  const startOf = (j: number) => changes[j] - lead + cell * stagger;
  let j = -1;
  for (let k = 0; k < changes.length; k++) if (frame >= startOf(k)) j = k;
  if (j < 0) return [];

  const p = (fr: number) => ease.outExpo(clamp((fr - startOf(j)) / duration));
  const o = p(frame) * slots;
  const v = Math.abs(o - p(frame - 1) * slots) * slot;
  const blur = Math.min(30, v * 0.3);

  const out: SlotGlyph[] = [];
  for (let k = 0; k <= slots; k++) {
    const y = slot * (k - o);
    if (Math.abs(y) >= slot * 0.98) continue;
    let ch: string | undefined;
    if (k === 0) ch = j > 0 ? glyphAt(j - 1) : undefined;
    else if (k === slots) ch = glyphAt(j);
    else if (glyphAt(j) !== undefined || (j > 0 && glyphAt(j - 1) !== undefined)) {
      ch = SCRAMBLE[Math.floor(rand(seed, j, cell, k) * 36)];
    }
    if (!ch) continue;
    const xFrom = j > 0 && glyphAt(j - 1) !== undefined ? xAt(j - 1) : xAt(j);
    const xTo = glyphAt(j) !== undefined ? xAt(j) : xFrom;
    out.push({
      ch,
      x: lerp(xFrom, xTo, k / slots),
      y,
      blur,
      key: `${cell}-${j}-${k}`,
      landed: k === slots && o >= slots * 0.985,
    });
  }
  return out;
};
