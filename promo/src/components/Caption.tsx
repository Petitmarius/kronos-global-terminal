import React from 'react';
import { useCurrentFrame } from 'remotion';

import { C, DISPLAY, MONO } from '../theme';
import { ease, prog } from '../lib/anim';
import { DecodeText, MaskLines } from './Atoms';

export const Hl: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.green }) => (
  <span style={{ color, textShadow: `0 0 34px ${color}55` }}>{children}</span>
);

/**
 * Feature caption, left column: numbered kicker (decodes in), a two-line
 * headline that rolls up from a mask, and a mono spec line.
 */
export const Caption: React.FC<{
  index: string;
  label: string;
  lines: React.ReactNode[];
  sub: string[];
  inAt: number;
  outAt: number;
  top?: number;
}> = ({ index, label, lines, sub, inAt, outAt, top = 392 }) => {
  const frame = useCurrentFrame();
  if (frame < inAt - 1 || frame > outAt + 24) return null;
  const kIn = prog(frame, inAt, 16, ease.outExpo);
  const out = prog(frame, outAt, 12, ease.inCubic);
  const subIn = prog(frame, inAt + 14, 26, ease.outExpo);
  const bar = prog(frame, inAt, 22, ease.outExpo) * (1 - out);

  return (
    <div style={{ position: 'absolute', left: 100, top, width: 620 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          height: 28,
          opacity: kIn * (1 - out),
          transform: `translateY(${-10 * out}px)`,
        }}
      >
        <div style={{ width: 34 * bar, height: 4, background: C.green, boxShadow: `0 0 12px ${C.green}` }} />
        <DecodeText
          text={index}
          start={inAt}
          duration={10}
          seed={index.charCodeAt(1)}
          style={{ font: `800 22px/1 ${MONO}`, color: C.green, letterSpacing: '0.1em' }}
        />
        <div style={{ width: 36, height: 1, background: 'rgba(167,180,194,0.45)' }} />
        <DecodeText
          text={label}
          start={inAt + 3}
          duration={16}
          seed={label.length}
          style={{ font: `700 21px/1 ${MONO}`, color: C.textDim, letterSpacing: '0.32em' }}
        />
      </div>
      <MaskLines
        lines={lines}
        inAt={inAt + 2}
        outAt={outAt}
        stagger={6}
        inDur={30}
        outDur={10}
        style={{
          marginTop: 30,
          font: `800 84px/1 ${DISPLAY}`,
          letterSpacing: '-0.028em',
          wordSpacing: '0.08em',
          color: C.text,
        }}
      />
      <div
        style={{
          marginTop: 34,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 14,
          rowGap: 10,
          font: `600 22px/1.2 ${MONO}`,
          letterSpacing: '0.03em',
          color: '#93A2B1',
          opacity: subIn * (1 - out),
          transform: `translateY(${18 * (1 - subIn) - 10 * out}px)`,
        }}
      >
        {sub.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 ? <span style={{ color: C.green, opacity: 0.8 }}>·</span> : null}
            <span>{s}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
