// Renders a handful of frames to PNG for quick visual review.
// Usage: node scripts/stills.mjs <outDir> <frame> [frame...]
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';

const [outDir, ...frames] = process.argv.slice(2);
if (!outDir || frames.length === 0) {
  console.error('usage: node scripts/stills.mjs <outDir> <frame> [frame...]');
  process.exit(1);
}

const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const browser = await openBrowser('chrome', {
  browserExecutable: process.env.REMOTION_BROWSER ?? null,
});
const composition = await selectComposition({ serveUrl, id: 'KronosPromo', puppeteerInstance: browser });

for (const f of frames.map(Number)) {
  const output = path.join(outDir, `f${String(f).padStart(4, '0')}.png`);
  await renderStill({ composition, serveUrl, frame: f, output, puppeteerInstance: browser, imageFormat: 'png' });
  console.log('rendered', output);
}
await browser.close({ silent: true });
