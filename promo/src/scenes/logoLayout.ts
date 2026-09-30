import { ease, prog } from '../lib/anim';
import { CAP_HEIGHT, GLYPH_ADVANCE, O_CENTER } from '../lib/glyphs';
import { f, T } from '../theme';

// Geometry shared by the hook's slot letters, the KRONOS wordmark and the
// portal that flies through the green "O".
export const HOOK_FS = 200; // px per em
export const K = HOOK_FS / 1000;
export const ADV = GLYPH_ADVANCE * K; // 120 px
export const CAP = CAP_HEIGHT * K; // 146 px
export const BASELINE = 573; // cap centre lands on y = 500
export const WORD_CY = BASELINE - CAP / 2;

export const LAND = f(T.logo.land); // KRONOS lands
export const PORTAL_IN = f(T.logo.portal);
export const PORTAL_OUT = f(T.logo.portalEnd);

/** Tracking opens up after the logo lands (a slow, confident breath). */
export const spacingAt = (frame: number) => 18 + 26 * prog(frame, LAND, 70, ease.outCubic);

export const startX = (n: number, spacing: number) => 960 - (n * ADV + (n - 1) * spacing) / 2;

/** Screen position of the O's optical centre in "KRONOS". */
export const oCenter = (frame: number) => {
  const sp = spacingAt(Math.min(frame, PORTAL_IN));
  return {
    x: startX(6, sp) + 2 * (ADV + sp) + O_CENTER.x * K,
    y: BASELINE - O_CENTER.y * K,
  };
};

/** Portal zoom factor: 1 → 64, exponential so the speed feels constant-accelerating. */
export const portalScale = (frame: number) => {
  const t = prog(frame, PORTAL_IN, PORTAL_OUT - PORTAL_IN, ease.inCubic);
  return Math.pow(64, t);
};

/** Slow push on the wordmark while it holds, before the portal takes over. */
export const breathe = (frame: number) => 1 + 0.035 * prog(Math.min(frame, PORTAL_IN), LAND + 10, 90, ease.outCubic);

/** Total zoom of the wordmark around the O centre (hold push × portal). */
export const logoZoom = (frame: number) => breathe(frame) * portalScale(frame);

/** Font units of the O glyph → screen pixels at this frame (used by the portal mask). */
export const portalMap = (frame: number) => {
  const o = oCenter(frame);
  const k = K * logoZoom(frame);
  return (x: number, y: number): [number, number] => [o.x + (x - 300) * k, o.y - (y - 365) * k];
};
