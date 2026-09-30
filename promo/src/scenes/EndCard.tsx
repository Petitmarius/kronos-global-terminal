import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { C, DISPLAY, f, MONO, T } from '../theme';
import { clamp, ease, kf, prog, punch, rand } from '../lib/anim';
import { glyphPath } from '../lib/glyphs';
import { reel } from '../lib/slot';
import { DecodeText, MaskLines } from '../components/Atoms';
import { Hl } from '../components/Caption';
import { LineChart } from '../components/LineChart';

const START = f(T.end.start);
const TAG = f(T.end.tagline);
const CTA = f(T.end.cta);
const URL_AT = f(T.end.url);
const CLICK = f(T.end.click);

const FS = 150;
const K = FS / 1000;
const ADV = 600 * K;
const SP = 34;
const BASE = 400;
const WORD = 'KRONOS';
const X0 = 960 - (6 * ADV + 5 * SP) / 2;

const REPO = 'github.com/Petitmarius/kronos-global-terminal';

const GithubMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="#F2F6FA">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const STAR = 'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z';

/** Wordmark letters roll up into place — the same slot motion as the opening. */
const Wordmark: React.FC<{ frame: number }> = ({ frame }) => {
  const letters = WORD.split('').flatMap((_, i) =>
    reel({
      frame,
      cell: i,
      changes: [START],
      glyphAt: () => WORD[i],
      xAt: () => X0 + i * (ADV + SP),
      slot: 200,
      slots: 3,
      duration: 16,
      lead: 6,
      stagger: 1.8,
      seed: 29,
    }).map((g) => ({ glyph: g.ch, x: g.x, y: g.y, blur: g.blur, green: i === 2 && g.key.endsWith('-3'), key: g.key })),
  );
  const bandTop = BASE - 730 * K - 40;
  return (
    <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <defs>
        <clipPath id="endBand">
          <rect x="0" y={bandTop} width="1920" height={730 * K + 80} />
        </clipPath>
        {letters.map((l) =>
          l.blur > 0.4 ? (
            <filter key={l.key} id={`eb-${l.key}`} x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation={`0 ${l.blur.toFixed(2)}`} />
            </filter>
          ) : null,
        )}
        <filter id="endGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g clipPath="url(#endBand)">
        {letters.map((l) => (
          <path
            key={l.key}
            d={glyphPath(l.glyph)}
            transform={`translate(${l.x.toFixed(2)} ${(BASE + l.y).toFixed(2)}) scale(${K} ${-K})`}
            fill={l.green ? C.green : '#F3F7FA'}
            filter={l.green ? 'url(#endGlow)' : l.blur > 0.4 ? `url(#eb-${l.key})` : undefined}
          />
        ))}
      </g>
    </svg>
  );
};

const Cursor: React.FC<{ x: number; y: number; press: number; opacity: number }> = ({ x, y, press, opacity }) => (
  <svg
    width="44"
    height="44"
    viewBox="0 0 24 24"
    style={{
      position: 'absolute',
      left: x - 6,
      top: y - 3,
      opacity,
      transform: `scale(${1 - 0.16 * press})`,
      transformOrigin: '6px 3px',
      filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.55))',
    }}
  >
    <path d="M4.5 2.2 L4.5 19.6 L9 15.4 L12 22 L15 20.7 L12.1 14.2 L18.3 14.2 Z" fill="#FFFFFF" stroke="#0A0D10" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

/**
 * 16 → 19 s. The wordmark lands, the promise in one line, and the call to
 * action: a "Star on GitHub" button that gets clicked, plus the repo URL.
 */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < START - 4) return null;

  const oX = X0 + 2 * (ADV + SP) + 300 * K;
  const oY = BASE - 365 * K;
  const bloom = kf(frame, [
    [START + 4, 0],
    [START + 9, 1.1, ease.outCubic],
    [START + 60, 0.45],
    [CLICK, 0.45],
    [CLICK + 4, 0.8],
    [CLICK + 40, 0.45],
  ]);
  const shake = punch(frame, [START + 6], 16) * 6;

  // CTA button
  const btnIn = prog(frame, CTA, 24, ease.outBack);
  const pressed = punch(frame, [CLICK], 12, ease.outCubic);
  const starred = frame >= CLICK;
  const starPop = starred ? 1 + 0.45 * punch(frame, [CLICK], 18, ease.outCubic) : 1;
  const btnW = 560;
  const btnH = 92;
  const btnX = 960 - btnW / 2;
  const btnY = 640;
  const starX = btnX + btnW - 66;
  const starY = btnY + btnH / 2;

  // cursor path: in from lower right, onto the star, click, drift
  const cx = kf(frame, [
    [URL_AT, 1540],
    [CLICK - 6, starX + 4, ease.outCubic],
    [CLICK + 70, starX + 150, ease.inOutSine],
  ]);
  const cy = kf(frame, [
    [URL_AT, 1030],
    [CLICK - 6, starY + 4, ease.outCubic],
    [CLICK + 70, starY + 30, ease.inOutSine],
  ]);
  const cursorO = prog(frame, URL_AT, 10, ease.outCubic) * (1 - prog(frame, CLICK + 40, 30, ease.inOutSine));
  const press = punch(frame, [CLICK - 2], 12, ease.outCubic);

  const shimmer = ((frame - CTA - 20) % 100) / 44;

  const flash = kf(frame, [
    [START, 0.62],
    [START + 16, 0, ease.outCubic],
  ]);
  const push = 1 + 0.035 * prog(frame, START + 20, 160, ease.inOutSine);

  return (
    <AbsoluteFill>
    <LineChart start={START + 6} duration={150} opacity={0.32} seed={5} top={835} />
    <AbsoluteFill style={{ transform: `translateY(${shake * Math.sin(frame * 2.3)}px) scale(${push})` }}>
      <div
        style={{
          position: 'absolute',
          left: oX - 480,
          top: oY - 480,
          width: 960,
          height: 960,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,230,118,0.42) 0%, rgba(0,230,118,0.10) 32%, transparent 64%)',
          opacity: bloom,
        }}
      />
      <Wordmark frame={frame} />

      <div
        style={{
          position: 'absolute',
          top: 440,
          left: 0,
          width: 1920,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 30,
        }}
      >
        <div style={{ width: 140 * prog(frame, START + 8, 30, ease.outExpo), height: 1.5, background: 'linear-gradient(90deg, transparent, rgba(167,180,194,0.7))' }} />
        <DecodeText
          text="GLOBAL TERMINAL"
          start={START + 8}
          duration={20}
          seed={12}
          style={{ font: `600 26px/1 ${MONO}`, letterSpacing: '0.62em', color: '#B4C1CD', marginRight: '-0.62em' }}
        />
        <div style={{ width: 140 * prog(frame, START + 8, 30, ease.outExpo), height: 1.5, background: 'linear-gradient(90deg, rgba(167,180,194,0.7), transparent)' }} />
      </div>

      <MaskLines
        lines={[
          <span key="t">
            Real-time markets. Global macro. <Hl>One terminal.</Hl>
          </span>,
        ]}
        inAt={TAG}
        inDur={30}
        style={{
          position: 'absolute',
          top: 516,
          left: 0,
          width: 1920,
          textAlign: 'center',
          font: `700 46px/1.1 ${DISPLAY}`,
          letterSpacing: '-0.015em',
          color: '#E6ECF1',
        }}
      />

      {/* CTA button */}
      <div
        style={{
          position: 'absolute',
          left: btnX,
          top: btnY,
          width: btnW,
          height: btnH,
          borderRadius: btnH / 2,
          opacity: clamp(btnIn * 1.3),
          transform: `scale(${(0.8 + 0.2 * btnIn) * (1 - 0.045 * pressed)})`,
          background: 'linear-gradient(180deg, #13211A 0%, #0B130F 100%)',
          border: `2px solid rgba(0,230,118,${0.55 + 0.4 * pressed})`,
          boxShadow: `0 24px 60px rgba(0,0,0,0.55), 0 0 ${46 + 60 * pressed}px rgba(0,230,118,${0.28 + 0.3 * pressed}), inset 0 1px 0 rgba(255,255,255,0.08)`,
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingLeft: 40, flex: 1 }}>
          <GithubMark size={38} />
          <span style={{ font: `700 34px/1 ${DISPLAY}`, color: C.text, letterSpacing: '-0.01em' }}>Star on GitHub</span>
        </div>
        <div style={{ width: 1.5, height: 44, background: 'rgba(255,255,255,0.14)' }} />
        <div style={{ width: 130, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" style={{ transform: `scale(${starPop})`, overflow: 'visible' }}>
            <path
              d={STAR}
              fill={starred ? C.gold : 'none'}
              stroke={starred ? C.gold : C.green}
              strokeWidth={1.8}
              strokeLinejoin="round"
              style={{ filter: starred ? `drop-shadow(0 0 10px ${C.gold})` : undefined }}
            />
          </svg>
        </div>
        {shimmer >= 0 && shimmer <= 1 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.16) 50%, transparent 65%)',
              backgroundSize: '240% 100%',
              backgroundPosition: `${(1 - shimmer) * 140 - 20}% 0`,
            }}
          />
        ) : null}
      </div>

      <StarBurst frame={frame} x={starX} y={starY} />

      <div
        style={{
          position: 'absolute',
          top: 776,
          left: 0,
          width: 1920,
          textAlign: 'center',
          font: `600 29px/1 ${MONO}`,
          letterSpacing: '0.02em',
          color: '#8FA0B0',
          opacity: prog(frame, URL_AT - 2, 12, ease.outCubic),
        }}
      >
        <DecodeText text={REPO.slice(0, 23)} start={URL_AT} duration={16} seed={21} />
        <DecodeText text={REPO.slice(23)} start={URL_AT + 6} duration={16} seed={22} style={{ color: C.text }} />
      </div>

      {frame >= URL_AT ? <Cursor x={cx} y={cy} press={press} opacity={cursorO} /> : null}
    </AbsoluteFill>
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

const StarBurst: React.FC<{ frame: number; x: number; y: number }> = ({ frame, x, y }) => {
  const age = frame - CLICK;
  if (age < 0 || age > 50) return null;
  const ring = prog(frame, CLICK, 30, ease.outCubic);
  const plus = prog(frame, CLICK + 2, 44, ease.outCubic);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 110 * ring,
          top: y - 110 * ring,
          width: 220 * ring,
          height: 220 * ring,
          borderRadius: '50%',
          border: `3px solid ${C.gold}`,
          opacity: 1 - ring,
          boxShadow: `0 0 24px ${C.gold}`,
        }}
      />
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {Array.from({ length: 14 }).map((_, i) => {
          const ang = (i / 14) * Math.PI * 2 + rand(31, i) * 0.4;
          const t = clamp(age / (22 + rand(32, i) * 16));
          if (t >= 1) return null;
          const d = (40 + rand(33, i) * 90) * ease.outCubic(t);
          return (
            <circle
              key={i}
              cx={x + Math.cos(ang) * d}
              cy={y + Math.sin(ang) * d}
              r={3.4 * (1 - t) + 0.6}
              fill={i % 2 ? C.gold : C.green}
              opacity={1 - t}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: x + 26,
          top: y - 70 - 50 * plus,
          font: `800 30px/1 ${MONO}`,
          color: C.gold,
          opacity: plus < 0.7 ? 1 : 1 - (plus - 0.7) / 0.3,
          textShadow: `0 0 16px ${C.gold}88`,
        }}
      >
        +1
      </div>
    </>
  );
};
