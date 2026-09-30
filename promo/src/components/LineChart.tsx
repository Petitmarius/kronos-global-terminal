import React, { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';

import { C } from '../theme';
import { clamp, ease, prog, rand } from '../lib/anim';

const STEP = 31.9;

/** A glowing green price line that draws itself left → right, with a live "head". */
export const LineChart: React.FC<{
  start: number;
  duration: number;
  opacity: number;
  seed: number;
  top?: number; // roughly where the line lives vertically
}> = ({ start, duration, opacity, seed, top = 760 }) => {
  const frame = useCurrentFrame();
  const pts = useMemo(() => {
    const out: Array<[number, number]> = [];
    let walk = 0;
    for (let i = 0; i <= 64; i++) {
      walk += (rand(seed, i) - 0.47) * 38;
      const wave = Math.sin(i * 0.33) * 22 + Math.sin(i * 0.11 + 1.3) * 30;
      out.push([-40 + i * STEP, top + 145 - i * 2.35 + wave + walk * 0.9]);
    }
    return out;
  }, [seed, top]);

  if (opacity <= 0.001 || frame < start) return null;
  const p = prog(frame, start, duration, ease.inOutSine);
  const reveal = -40 + p * 2010;
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${d} L 1990 1100 L -40 1100 Z`;
  const seg = clamp((reveal + 40) / STEP, 0, 63.999);
  const i0 = Math.floor(seg);
  const t = seg - i0;
  const hx = pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * t;
  const hy = pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * t;
  const pulse = ((frame - start) % 30) / 30;
  const id = `lc-${seed}`;

  return (
    <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity }}>
      <defs>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.green} stopOpacity="0.22" />
          <stop offset="1" stopColor={C.green} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-reveal`}>
          <rect x="-60" y="0" width={reveal + 60} height="1080" />
        </clipPath>
        <filter id={`${id}-glow`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g clipPath={`url(#${id}-reveal)`}>
        <path d={area} fill={`url(#${id}-area)`} />
        <path d={d} stroke={C.green} strokeWidth={3.2} fill="none" filter={`url(#${id}-glow)`} strokeLinejoin="round" />
      </g>
      {p < 1 ? (
        <g>
          <circle cx={hx} cy={hy} r={7} fill="#E9FFF3" filter={`url(#${id}-glow)`} />
          <circle cx={hx} cy={hy} r={8 + pulse * 26} fill="none" stroke={C.green} strokeWidth={2} opacity={1 - pulse} />
          <line x1={hx} y1={hy} x2={1960} y2={hy} stroke={C.green} strokeOpacity={0.35} strokeDasharray="6 8" />
        </g>
      ) : null}
    </svg>
  );
};
