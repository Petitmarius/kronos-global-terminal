import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';

import { loadFonts } from './lib/fonts';
import { Background, Finish } from './components/Background';
import { Opening, PortalO } from './scenes/Opening';
import { Features } from './scenes/Features';
import { Montage } from './scenes/Montage';
import { EndCard } from './scenes/EndCard';

loadFonts();

/**
 * KRONOS — Global Terminal · 19 s motion-design promo (1920x1080, 60 fps).
 *
 *  0.0  hook: STOCKS → FOREX → CRYPTO → MACRO roll through a slot word
 *  2.0  lands on KRONOS · GLOBAL TERMINAL
 *  3.2  fly through the green O into the product
 *  4.0  01 Terminal · 6.5 02 Paper trading · 9.0 03 Global map · 11.5 04 Macro
 * 14.0  wall of every view + proof points
 * 16.0  wordmark, promise, "Try it live" call to action + the live app URL
 *
 * Every cue lives in ../timeline.json, shared with the soundtrack generator.
 */
export const KronosPromo: React.FC<{ withAudio?: boolean }> = ({ withAudio = true }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#06080B', overflow: 'hidden' }}>
      <Background />
      <Opening />
      <Features />
      <PortalO />
      <Montage />
      <EndCard />
      <Finish />
      {withAudio ? <Audio src={staticFile('audio/soundtrack.wav')} /> : null}
    </AbsoluteFill>
  );
};
