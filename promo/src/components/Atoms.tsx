import React from 'react';
import { useCurrentFrame } from 'remotion';

import { C, MONO } from '../theme';
import { ease, prog, rand } from '../lib/anim';
import { SCRAMBLE } from '../lib/glyphs';

/** ▲ / ▼ as vector triangles (the font subset has no geometric shapes). */
export const Tri: React.FC<{ up: boolean; size?: number; color?: string; style?: React.CSSProperties }> = ({
  up,
  size = 14,
  color,
  style,
}) => (
  <svg
    width={size}
    height={size * 0.78}
    viewBox="0 0 10 7.8"
    style={{ display: 'inline-block', verticalAlign: 'middle', overflow: 'visible', ...style }}
  >
    <path d={up ? 'M5 0 L10 7.8 L0 7.8 Z' : 'M0 0 L10 0 L5 7.8 Z'} fill={color ?? (up ? C.green : C.red)} />
  </svg>
);

/**
 * Terminal-style decode: each character flickers through random glyphs
 * before locking in, left to right. Meant for monospace text (fixed widths).
 */
export const DecodeText: React.FC<{
  text: string;
  start: number;
  duration?: number;
  style?: React.CSSProperties;
  seed?: number;
}> = ({ text, start, duration = 16, style, seed = 1 }) => {
  const frame = useCurrentFrame();
  const n = text.length;
  const out = text.split('').map((ch, i) => {
    if (ch === ' ') return ' ';
    const appear = start + (i / n) * duration * 0.45;
    const settle = appear + duration * 0.55;
    if (frame < appear) return ' ';
    if (frame >= settle) return ch;
    return SCRAMBLE[Math.floor(rand(seed, i, Math.floor(frame / 2)) * SCRAMBLE.length)];
  });
  return <span style={{ whiteSpace: 'pre', ...style }}>{out.join('')}</span>;
};

/**
 * Lines that roll up into view from behind a mask, and roll out upwards —
 * the same vertical "ticker roll" that drives the whole video.
 */
export const MaskLines: React.FC<{
  lines: React.ReactNode[];
  inAt: number;
  outAt?: number;
  stagger?: number;
  inDur?: number;
  outDur?: number;
  style?: React.CSSProperties;
}> = ({ lines, inAt, outAt = Infinity, stagger = 5, inDur = 28, outDur = 14, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={style}>
      {lines.map((line, i) => {
        const pin = prog(frame, inAt + i * stagger, inDur, ease.outExpo);
        const pout = prog(frame, outAt + i * 2, outDur, ease.inExpo);
        const y = 118 * (1 - pin) - 118 * pout;
        return (
          <div key={i} style={{ overflow: 'hidden', paddingBottom: '0.14em', marginBottom: '-0.14em' }}>
            <div style={{ transform: `translateY(${y}%)`, willChange: 'transform' }}>{line}</div>
          </div>
        );
      })}
    </div>
  );
};

/** Expanding click ripple (ring + core dot) — placed in the parent's coordinates. */
export const Ripple: React.FC<{ x: number; y: number; at: number; color?: string; size?: number }> = ({
  x,
  y,
  at,
  color = C.green,
  size = 90,
}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + 40) return null;
  const p = prog(frame, at, 34, ease.outCubic);
  const p2 = prog(frame, at + 5, 34, ease.outCubic);
  const core = 1 - prog(frame, at, 16, ease.outCubic);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, pointerEvents: 'none' }}>
      {[p, p2].map((q, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: (-size * q) / 2,
            top: (-size * q) / 2,
            width: size * q,
            height: size * q,
            borderRadius: '50%',
            border: `${i === 0 ? 3 : 2}px solid ${color}`,
            opacity: (1 - q) * (i === 0 ? 1 : 0.6),
            boxShadow: `0 0 18px ${color}`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: -9,
          top: -9,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: color,
          opacity: core * 0.9,
          boxShadow: `0 0 24px 6px ${color}`,
        }}
      />
    </div>
  );
};

/** Viewfinder corner brackets that snap around a rectangle. */
export const Brackets: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  at: number;
  until?: number;
  color?: string;
  arm?: number;
  label?: string;
}> = ({ x, y, w, h, at, until = Infinity, color = C.green, arm = 26, label }) => {
  const frame = useCurrentFrame();
  const pin = prog(frame, at, 20, ease.outExpo);
  const pout = prog(frame, until, 10, ease.inCubic);
  const o = pin * (1 - pout);
  if (o <= 0.001) return null;
  const pad = 26 * (1 - pin);
  const corners: Array<[number, number, number, number]> = [
    [x - pad, y - pad, 1, 1],
    [x + w + pad, y - pad, -1, 1],
    [x - pad, y + h + pad, 1, -1],
    [x + w + pad, y + h + pad, -1, -1],
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, pointerEvents: 'none' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {corners.map(([cx, cy, sx, sy], i) => (
          <path
            key={i}
            d={`M ${cx} ${cy + sy * arm} L ${cx} ${cy} L ${cx + sx * arm} ${cy}`}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeLinecap="square"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        ))}
      </svg>
      {label ? (
        <div
          style={{
            position: 'absolute',
            left: x - pad,
            top: y - pad - 42,
            font: `800 20px/1 ${MONO}`,
            letterSpacing: '0.18em',
            color: '#07110B',
            background: color,
            padding: '7px 10px 6px',
            borderRadius: 4,
            boxShadow: `0 0 22px ${color}66`,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
