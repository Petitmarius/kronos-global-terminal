import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { C } from '../theme';
import { kf } from '../lib/anim';

/**
 * Deep near-black stage: two slow "aurora" glows (brand green + a cool
 * blue), a faint drifting grid that fades toward the edges, and a vignette.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 60;
  // The green glow swells at the logo and at the end card.
  const greenAmt = kf(frame, [
    [0, 0.07],
    [120, 0.16],
    [200, 0.1],
    [900, 0.1],
    [960, 0.2],
    [1140, 0.16],
  ]);
  const gx = 960 + Math.sin(t * 0.55) * 380;
  const gy = 420 + Math.cos(t * 0.4) * 160;
  const bx = 1500 - Math.sin(t * 0.35) * 300;
  const by = 820 + Math.sin(t * 0.5) * 120;
  const drift = frame * 0.35;

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 760px at ${gx}px ${gy}px, rgba(0,230,118,${greenAmt}), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 800px at ${bx}px ${by}px, rgba(66,165,245,0.075), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '96px 96px',
          backgroundPosition: `${-drift}px ${-drift * 0.45}px`,
          maskImage: 'radial-gradient(ellipse 72% 70% at 50% 48%, #000 25%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 72% 70% at 50% 48%, #000 25%, transparent 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

/** Cinematic finishing: animated film grain + vignette, on top of everything. */
export const Finish: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = frame % 12;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse 85% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)',
        }}
      />
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity: 0.075, mixBlendMode: 'overlay' }}>
        <filter id={`grain-${seed}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="1920" height="1080" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};
