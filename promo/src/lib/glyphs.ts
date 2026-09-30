import data from './glyphs.json';

// JetBrains Mono ExtraBold outlines (font units, y-up, 1000 upm) exported
// with fontTools, so the wordmark and the slot-machine letters are drawn as
// exact vector shapes — crisp at any zoom, including the fly-through-the-O.
export const GLYPH_ADVANCE = data.advance; // 600 units: it's a monospace
export const CAP_HEIGHT = data.capHeight; // 730 units
const glyphs = data.glyphs as Record<string, string>;

export const glyphPath = (ch: string) => glyphs[ch] ?? '';

export const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@+/*=<>';

// Centre of the "O" in font units, and its counter (the hole) as commands.
export const O_CENTER = { x: 300, y: 365 };
type Cmd = [string, number[]];
const counter = data.oCounter as Cmd[];

/**
 * The O's counter as an SVG/CSS path string, mapped from font units to
 * screen pixels: `map(x, y)` returns the transformed point. `grow` inflates
 * the hole around its centre so its edge hides under the O's stroke.
 */
export const counterPath = (map: (x: number, y: number) => [number, number], grow = 1) => {
  const g = (x: number, y: number) =>
    map(O_CENTER.x + (x - O_CENTER.x) * grow, O_CENTER.y + (y - O_CENTER.y) * grow);
  return counter
    .map(([op, a]) => {
      if (op === 'Z') return 'Z';
      const pts: string[] = [];
      for (let i = 0; i < a.length; i += 2) {
        const [x, y] = g(a[i], a[i + 1]);
        pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
      }
      return `${op} ${pts.join(' ')}`;
    })
    .join(' ');
};
