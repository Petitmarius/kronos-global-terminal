import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { C, DISPLAY, f, MONO, SRC_H, SRC_W, T } from '../theme';
import { ease, kf, prog } from '../lib/anim';
import { Cam, camTransform, Clip } from '../components/ScreenCard';

const START = f(T.montage.start);
const END = f(T.end.start);
const CHIPS = T.montage.chips.map(f);

const TW = 600;
const TH = 286; // 600 * 914 / 1920
const GAP = 34;
const G0 = 1.8; // grid scale when the montage opens (centre tile ≈ the macro card)

type Tile = { clip: string; at: number; cam: Cam; tag: string };

// Every view of the product, playing at once.
const TILES: Tile[] = [
  { clip: 'terminal-nas', at: 1.0, cam: { zoom: 1.5, fx: 860, fy: 480 }, tag: 'NAS100' },
  { clip: 'map-portfolio', at: 0.5, cam: { zoom: 1.25, fx: 960, fy: 480 }, tag: 'PORTFOLIO MAP' },
  { clip: 'macro-top', at: 0.5, cam: { zoom: 1.6, fx: 660, fy: 250 }, tag: 'RISK BAROMETER' },
  { clip: 'terminal-candles', at: 2.2, cam: { zoom: 1.5, fx: 860, fy: 500 }, tag: 'SPX500 · CANDLES' },
  { clip: 'macro-corr', at: 2.0 + (START - f(T.f4.corr)) / 60, cam: { zoom: 1.3, fx: 660, fy: 540 }, tag: 'CORRELATIONS' },
  { clip: 'terminal-positions', at: 0.6, cam: { zoom: 1.3, fx: 900, fy: 450 }, tag: 'POSITIONS' },
  { clip: 'map-geo', at: 0.5, cam: { zoom: 1.4, fx: 900, fy: 470 }, tag: 'GEOPOLITICAL' },
  { clip: 'terminal-mu', at: 0.2, cam: { zoom: 1.5, fx: 860, fy: 480 }, tag: 'MU · LIVE' },
  { clip: 'macro-rrg', at: 3.6, cam: { zoom: 1.6, fx: 640, fy: 660 }, tag: 'SECTOR ROTATION' },
];

/** Where the centre tile sits on screen at the first montage frame (handoff from the macro card). */
export const MONTAGE_CENTER = {
  x: 960,
  y: 540,
  w: TW * G0,
  h: TH * G0,
  radius: 12 * G0,
  cam: TILES[4].cam,
};

const Check: React.FC = () => (
  <svg width="30" height="30" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill={C.green} />
    <path d="M6.8 12.4l3.4 3.3 7-7.2" stroke="#04120A" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CHIP_TEXT = ['REAL MARKET DATA', 'LIVE STREAMING', 'PAPER TRADING'];

/**
 * 14 → 16 s. Pull back from the macro screen to a tilted wall of every
 * view in KRONOS, while the three proof points pop on the beat.
 */
export const Montage: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < START || frame >= END) return null;

  const G = kf(frame, [
    [START, G0],
    [START + 58, 0.86, ease.pull],
    [END - 30, 0.92, ease.linear],
    [END, 5.2, ease.inExpo],
  ]);
  const tilt = kf(frame, [
    [START, 0],
    [START + 58, 1, ease.pull],
    [END - 30, 1],
    [END, 0.2, ease.inCubic],
  ]);
  const drift = (frame - START) / 60;
  const rx = 17 * tilt;
  const ry = (-7 + drift * 1.5) * tilt;
  const rz = (-5 + drift * 0.8) * tilt;
  const blur = kf(frame, [
    [END - 12, 0],
    [END, 14, ease.inCubic],
  ]);
  const flash = kf(frame, [
    [END - 8, 0],
    [END, 0.62, ease.inCubic],
  ]);

  const gridW = 3 * TW + 2 * GAP;
  const gridH = 3 * TH + 2 * GAP;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ perspective: 2200, filter: blur > 0.2 ? `blur(${blur}px)` : undefined }}>
        <div
          style={{
            position: 'absolute',
            left: 960 - gridW / 2,
            top: 540 - gridH / 2,
            width: gridW,
            height: gridH,
            transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${G})`,
          }}
        >
          {TILES.map((t, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const isCenter = i === 4;
            // outer tiles fly in from depth as the camera pulls back
            const pin = isCenter ? 1 : prog(frame, START + 2 + ((i * 7) % 9), 30, ease.outExpo);
            const pose = { x: TW / 2, y: TH / 2, w: TW, h: TH };
            const { s, tx, ty } = camTransform(pose, t.cam);
            const tagIn = prog(frame, START + 24 + i * 2, 20, ease.outExpo);
            return (
              <div
                key={t.clip}
                style={{
                  position: 'absolute',
                  left: col * (TW + GAP),
                  top: row * (TH + GAP),
                  width: TW,
                  height: TH,
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: C.bg2,
                  opacity: pin,
                  transform: `translateZ(${(1 - pin) * -900}px)`,
                  boxShadow: isCenter
                    ? '0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(0,230,118,0.18)'
                    : '0 24px 60px rgba(0,0,0,0.55)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: SRC_W,
                    height: SRC_H,
                    transformOrigin: '0 0',
                    transform: `translate(${tx}px, ${ty}px) scale(${s})`,
                  }}
                >
                  <Clip name={t.clip} from={START} to={END + 2} at={t.at} />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 12,
                    bottom: 12,
                    padding: '6px 9px 5px',
                    borderRadius: 5,
                    background: 'rgba(6,8,11,0.82)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    font: `700 13px/1 ${MONO}`,
                    letterSpacing: '0.16em',
                    color: '#C9D4DE',
                    opacity: tagIn,
                  }}
                >
                  {t.tag}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 12,
                    boxShadow: `inset 0 0 0 1px rgba(255,255,255,${isCenter ? 0.14 : 0.09})`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* proof points */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, transparent 33%, rgba(4,6,9,0.78) 44%, rgba(4,6,9,0.78) 56%, transparent 67%)',
          opacity: prog(frame, CHIPS[0] - 6, 14, ease.outCubic) * (1 - prog(frame, END - 14, 10, ease.inCubic)),
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 540 - 44,
          left: 0,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        {CHIP_TEXT.map((txt, i) => {
          const p = prog(frame, CHIPS[i] - 3, 18, ease.outBack);
          const glow = 1 - prog(frame, CHIPS[i], 24, ease.outCubic);
          const out = prog(frame, END - 14 + i * 2, 10, ease.inCubic);
          return (
            <div
              key={txt}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                height: 88,
                padding: '0 34px 0 26px',
                borderRadius: 999,
                background: 'linear-gradient(180deg, rgba(16,24,20,0.96), rgba(9,14,12,0.96))',
                border: `1.5px solid rgba(0,230,118,${0.35 + 0.5 * glow})`,
                boxShadow: `0 20px 50px rgba(0,0,0,0.5), 0 0 ${20 + 50 * glow}px rgba(0,230,118,${0.18 + 0.35 * glow})`,
                font: `800 30px/1 ${DISPLAY}`,
                letterSpacing: '0.04em',
                color: C.text,
                opacity: Math.min(1, p * 1.4) * (1 - out),
                transform: `translateY(${(1 - p) * 26 - out * 20}px) scale(${0.82 + 0.18 * p})`,
              }}
            >
              <Check />
              {txt}
            </div>
          );
        })}
      </div>

      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse 60% 55% at 50% 50%, #F0FFF6 0%, #9CF5C6 45%, rgba(0,230,118,0.35) 100%)',
          opacity: flash,
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  );
};
