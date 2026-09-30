import { continueRender, delayRender, staticFile } from 'remotion';

// Local copies of the OFL fonts (JetBrains Mono is the app's own font;
// Inter Tight carries the headlines). Loaded before the first frame renders.
const FACES: Array<[family: string, weight: number, file: string]> = [
  ['JetBrains Mono', 500, 'jetbrains-mono-latin-500-normal.woff2'],
  ['JetBrains Mono', 600, 'jetbrains-mono-latin-600-normal.woff2'],
  ['JetBrains Mono', 700, 'jetbrains-mono-latin-700-normal.woff2'],
  ['JetBrains Mono', 800, 'jetbrains-mono-latin-800-normal.woff2'],
  ['Inter Tight', 500, 'inter-tight-latin-500-normal.woff2'],
  ['Inter Tight', 600, 'inter-tight-latin-600-normal.woff2'],
  ['Inter Tight', 700, 'inter-tight-latin-700-normal.woff2'],
  ['Inter Tight', 800, 'inter-tight-latin-800-normal.woff2'],
  ['Inter Tight', 900, 'inter-tight-latin-900-normal.woff2'],
];

let started = false;

export const loadFonts = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('Loading fonts');
  Promise.all(
    FACES.map(([family, weight, file]) => {
      const face = new FontFace(family, `url('${staticFile(`fonts/${file}`)}') format('woff2')`, {
        weight: String(weight),
        style: 'normal',
      });
      return face.load().then((loaded) => {
        document.fonts.add(loaded);
      });
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error('Font loading failed', err);
      continueRender(handle);
    });
};
