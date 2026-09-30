import React from 'react';
import { useCurrentFrame } from 'remotion';

import { C, MONO } from '../theme';
import { ease, kf, prog } from '../lib/anim';

const TABS = ['TERMINAL', 'GLOBAL', 'MACRO'];
const FS = 19; // font size
const LS = 2.2; // letter spacing px
const PAD = 24;
const GAP = 6;
const tabW = (label: string) => label.length * (FS * 0.6 + LS) + PAD * 2;

/**
 * The app's own view switcher (TERMINAL · GLOBAL · MACRO), rebuilt as a
 * floating pill: the green active tab glides to each view as the film
 * moves through the product. `switches` = frames where the next tab is hit.
 */
export const NavPill: React.FC<{ inAt: number; outAt: number; switches: number[] }> = ({ inAt, outAt, switches }) => {
  const frame = useCurrentFrame();
  if (frame < inAt || frame > outAt + 20) return null;

  const widths = TABS.map(tabW);
  const lefts = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b + GAP, 0));
  const total = lefts[2] + widths[2];

  // Active position is a float index so the highlight can glide.
  const idx = kf(frame, [
    [switches[0] - 1, 0],
    [switches[0] + 14, 1, ease.outExpo],
    [switches[1] - 1, 1],
    [switches[1] + 14, 2, ease.outExpo],
  ]);
  const i0 = Math.floor(idx);
  const i1 = Math.min(2, i0 + 1);
  const t = idx - i0;
  const hlLeft = lefts[i0] + (lefts[i1] - lefts[i0]) * t;
  const hlW = widths[i0] + (widths[i1] - widths[i0]) * t;
  // A squash on the highlight while it travels.
  const squash = 1 - 0.18 * Math.sin(Math.PI * t);

  const pin = prog(frame, inAt, 26, ease.outExpo);
  const pout = prog(frame, outAt, 14, ease.inCubic);
  const y = -70 * (1 - pin) - 70 * pout;
  const o = pin * (1 - pout);

  const press = (i: number) => {
    const hit = switches[i - 1];
    if (hit === undefined) return 1;
    const p = prog(frame, hit - 4, 12, ease.linear);
    return 1 - 0.08 * Math.sin(Math.PI * p);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: '50%',
        transform: `translate(-50%, ${y}px)`,
        opacity: o,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: total + 12,
          height: 56,
          padding: 6,
          borderRadius: 14,
          background: 'linear-gradient(180deg, rgba(20,26,32,0.92), rgba(12,16,21,0.92))',
          border: `1px solid ${C.border2}`,
          boxShadow: '0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6 + hlLeft + (hlW * (1 - squash)) / 2,
            width: hlW * squash,
            height: 44,
            borderRadius: 9,
            background: C.green,
            boxShadow: `0 0 26px ${C.green}88, 0 0 2px ${C.green}`,
          }}
        />
        {/* dim labels, then dark labels clipped to the sliding highlight (text inverts under it) */}
        {[false, true].map((inverted) => (
          <div
            key={String(inverted)}
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: inverted
                ? `inset(6px ${total + 12 - (6 + hlLeft + (hlW * (1 + squash)) / 2)}px 6px ${6 + hlLeft + (hlW * (1 - squash)) / 2}px round 9px)`
                : undefined,
            }}
          >
            {TABS.map((label, i) => (
              <div
                key={label}
                style={{
                  position: 'absolute',
                  top: 6,
                  left: 6 + lefts[i],
                  width: widths[i],
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  font: `800 ${FS}px/1 ${MONO}`,
                  letterSpacing: LS,
                  color: inverted ? '#06110B' : C.muted,
                  transform: `scale(${press(i)})`,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        ))}
      </div>
      <LiveBadge />
    </div>
  );
};

export const LiveBadge: React.FC<{ scale?: number }> = ({ scale = 1 }) => {
  const frame = useCurrentFrame();
  const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((frame / 60) * Math.PI * 2));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10 * scale,
        height: 44 * scale,
        padding: `0 ${16 * scale}px`,
        borderRadius: 10 * scale,
        border: '1px solid rgba(0,230,118,0.35)',
        background: 'rgba(0,230,118,0.08)',
        font: `800 ${17 * scale}px/1 ${MONO}`,
        letterSpacing: '0.14em',
        color: C.green,
      }}
    >
      <div
        style={{
          width: 10 * scale,
          height: 10 * scale,
          borderRadius: '50%',
          background: C.green,
          opacity: pulse,
          boxShadow: `0 0 ${12 * scale}px 3px rgba(0,230,118,${0.7 * pulse})`,
        }}
      />
      LIVE DATA
    </div>
  );
};
