import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { C, MONO, f, T } from '../theme';
import { clamp, ease, kf, prog, punch, rand } from '../lib/anim';
import { glyphPath } from '../lib/glyphs';
import { reel } from '../lib/slot';
import { DecodeText, Tri } from '../components/Atoms';
import { LineChart } from '../components/LineChart';
import { ADV, BASELINE, breathe, CAP, K, LAND, logoZoom, oCenter, PORTAL_IN, PORTAL_OUT, spacingAt, startX } from './logoLayout';

const WORDS = ['STOCKS', 'FOREX', 'CRYPTO', 'MACRO', 'KRONOS'];
const CHANGES = [...T.hook.words.map(f), LAND];

// Real quotes lifted from the recordings.
const CHIPS: Array<{ sym: string; px: string; chg: string; up: boolean } | null> = [
  { sym: 'NVDA', px: '222.49', chg: '4.43%', up: true },
  { sym: 'EURUSD', px: '1.16445', chg: '0.12%', up: false },
  { sym: 'BTCUSD', px: '79,483.99', chg: '0.58%', up: true },
  { sym: 'RISK-ON', px: '62 / 100', chg: '', up: true },
  null,
];

const TAPE: Array<[string, string, string, boolean]> = [
  ['XAUUSD', '4,599.70', '1.15%', false],
  ['USDJPY', '159.424', '0.10%', true],
  ['NVDA', '222.49', '4.43%', true],
  ['TSLA', '346.35', '1.11%', false],
  ['BTCUSD', '79,483.99', '0.58%', true],
  ['EURUSD', '1.16445', '0.12%', false],
  ['NAS100', '29,224.52', '0.05%', true],
  ['SPX500', '7,675.70', '0.02%', false],
  ['ETHUSD', '2,501.61', '0.20%', false],
  ['WTI', '82.60', '0.45%', true],
  ['AAPL', '310.55', '0.21%', true],
  ['GER40', '26,387.47', '0.39%', true],
];

const LEAD = 7; // reels start spinning a few frames before the beat

type Cell = { ch: string; x: number; y: number; blur: number; green: boolean; key: string };

const cellsAt = (frame: number): Cell[] => {
  const sp = spacingAt(frame);
  const cells: Cell[] = [];
  for (let i = 0; i < 6; i++) {
    const glyphs = reel({
      frame,
      cell: i,
      changes: CHANGES,
      glyphAt: (w) => WORDS[w][i],
      xAt: (w) => startX(WORDS[w].length, sp) + i * (ADV + sp),
      slot: 250,
      slots: 3,
      duration: 14,
      lead: LEAD,
      stagger: 1.2,
      seed: 17,
    });
    for (const g of glyphs) {
      const isO = g.key === `2-4-3`; // KRONOS's O arriving on reel 2
      cells.push({ ch: g.ch, x: g.x, y: g.y, blur: g.blur, green: isO, key: g.key });
    }
  }
  return cells;
};

/** The green line-chart that draws itself behind the hook. */
const Chart: React.FC<{ frame: number }> = ({ frame }) => {
  const fade = kf(frame, [
    [0, 0.85],
    [LAND, 1],
    [LAND + 40, 0.42],
  ]);
  return <LineChart start={0} duration={112} opacity={fade} seed={11} top={760} />;
};

const Tape: React.FC<{ frame: number }> = ({ frame }) => {
  const items = [...TAPE, ...TAPE, ...TAPE];
  const o = kf(frame, [
    [0, 0],
    [14, 0.62],
    [PORTAL_IN, 0.62],
    [PORTAL_IN + 10, 0],
  ]);
  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: 0,
        width: 1920,
        height: 40,
        overflow: 'hidden',
        opacity: o,
        maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
      }}
    >
      <div
        style={{
          display: 'flex',
          whiteSpace: 'nowrap',
          transform: `translateX(${-frame * 2.4 - 200}px)`,
          font: `600 21px/40px ${MONO}`,
        }}
      >
        {items.map(([sym, px, chg, up], i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0 30px' }}>
            <b style={{ color: '#DCE4EB', fontWeight: 800, letterSpacing: '0.04em' }}>{sym}</b>
            <span style={{ color: up ? C.green : C.red }}>{px}</span>
            <Tri up={up} size={12} />
            <span style={{ color: up ? C.green : C.red }}>{chg}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const ChipRow: React.FC<{ frame: number }> = ({ frame }) => (
  <div style={{ position: 'absolute', left: 0, top: 628, width: 1920, height: 74, overflow: 'hidden' }}>
    {CHIPS.map((chip, w) => {
      if (!chip) return null;
      // a chip rides in on its own change and out on the next one, on one strip
      const pin = ease.outExpo(clamp((frame - (CHANGES[w] - LEAD)) / 14));
      const pout = ease.outExpo(clamp((frame - (CHANGES[w + 1] - LEAD)) / 14));
      if (pin <= 0 || pout >= 1) return null;
      const y = 84 * (1 - pin) - 84 * pout;
      const col = chip.up ? C.green : C.red;
      return (
        <div
          key={w}
          style={{
            position: 'absolute',
            left: '50%',
            top: 8,
            transform: `translate(-50%, ${y}px)`,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            height: 58,
            padding: '0 26px',
            borderRadius: 12,
            border: `1px solid ${col}55`,
            background: `linear-gradient(180deg, ${col}1f, ${col}0a)`,
            font: `700 30px/1 ${MONO}`,
            color: '#E8EEF3',
            whiteSpace: 'nowrap',
          }}
        >
          <DecodeText text={chip.sym} start={CHANGES[w] - LEAD} duration={10} seed={w + 3} style={{ fontWeight: 800 }} />
          <span style={{ color: col }}>{chip.px}</span>
          {chip.chg ? (
            <>
              <Tri up={chip.up} size={17} />
              <span style={{ color: col }}>{chip.chg}</span>
            </>
          ) : null}
        </div>
      );
    })}
  </div>
);

/**
 * 0 → 3.55 s. Asset classes roll through a slot-machine word (STOCKS →
 * FOREX → CRYPTO → MACRO) and land on KRONOS; the green O then becomes a
 * portal the camera flies through into the product.
 */
export const Opening: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > PORTAL_OUT + 2) return null;

  const cells = cellsAt(frame);
  const o = oCenter(frame);
  const inPortal = frame >= PORTAL_IN;
  const S = logoZoom(frame);

  // beat punches on every word + a heavier one on the logo
  const hit = punch(frame, CHANGES.slice(0, 4), 12) * 0.035 + punch(frame, [LAND], 22) * 0.07;
  const zoom = inPortal ? S : (1 + hit) * breathe(frame);

  const bloom = kf(frame, [
    [LAND - 3, 0],
    [LAND + 1, 1.25, ease.outCubic],
    [LAND + 50, 0.55],
    [PORTAL_IN, 0.6],
    [PORTAL_IN + 12, 1.2],
  ]);
  const streak = kf(frame, [
    [LAND - 2, 0],
    [LAND + 1, 1, ease.outCubic],
    [LAND + 45, 0.28],
    [PORTAL_IN, 0.28],
    [PORTAL_IN + 6, 0],
  ]);
  const flash = punch(frame, CHANGES.slice(0, 4), 8) * 0.05 + punch(frame, [LAND], 14) * 0.22;
  const otherLetters = 1 - prog(frame, PORTAL_IN + 2, 12, ease.inCubic);
  const subOut = prog(frame, PORTAL_IN - 12, 12, ease.inCubic);

  const bandTop = BASELINE - CAP - 44;
  const bandH = CAP + 88;

  return (
    <AbsoluteFill>
      <Chart frame={frame} />
      <Tape frame={frame} />

      {/* logo bloom behind the O */}
      <div
        style={{
          position: 'absolute',
          left: o.x - 420,
          top: o.y - 420,
          width: 840,
          height: 840,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,230,118,0.55) 0%, rgba(0,230,118,0.12) 34%, transparent 66%)',
          opacity: bloom * 0.8,
          transform: `scale(${inPortal ? S * 0.6 : 1 + hit})`,
        }}
      />

      <AbsoluteFill
        style={{
          transformOrigin: `${o.x}px ${o.y}px`,
          transform: `scale(${zoom})`,
        }}
      >
        <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            <clipPath id="slotBand">
              <rect x="0" y={bandTop} width="1920" height={bandH} />
            </clipPath>
            {cells.map((c) =>
              c.blur > 0.4 ? (
                <filter key={c.key} id={`lb-${c.key}`} x="-20%" y="-60%" width="140%" height="220%">
                  <feGaussianBlur stdDeviation={`0 ${c.blur.toFixed(2)}`} />
                </filter>
              ) : null,
            )}
            <filter id="oGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="9" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g clipPath="url(#slotBand)">
            {cells.map((c) => {
              if (c.green && inPortal) return null; // drawn by the portal layer
              return (
                <path
                  key={c.key}
                  d={glyphPath(c.ch)}
                  transform={`translate(${c.x.toFixed(2)} ${(BASELINE + c.y).toFixed(2)}) scale(${K} ${-K})`}
                  fill={c.green ? C.green : '#F3F7FA'}
                  opacity={c.green ? 1 : inPortal ? otherLetters : 1}
                  filter={c.green ? 'url(#oGlow)' : c.blur > 0.4 ? `url(#lb-${c.key})` : undefined}
                />
              );
            })}
          </g>
        </svg>
      </AbsoluteFill>

      {/* anamorphic streak through the O */}
      <div
        style={{
          position: 'absolute',
          left: o.x - 900,
          top: o.y - 1,
          width: 1800,
          height: 3,
          opacity: streak,
          background: 'linear-gradient(90deg, transparent, rgba(0,230,118,0.55) 30%, #EFFFF6 50%, rgba(0,230,118,0.55) 70%, transparent)',
          boxShadow: '0 0 18px 4px rgba(0,230,118,0.45)',
          transform: `scaleX(${0.6 + 0.4 * streak})`,
        }}
      />

      <Sparks frame={frame} x={o.x} y={o.y} />

      <ChipRow frame={frame} />

      {/* GLOBAL TERMINAL */}
      {frame >= f(T.logo.subtitle) - 1 ? (
        <div
          style={{
            position: 'absolute',
            top: 668,
            left: 0,
            width: 1920,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 34,
            opacity: 1 - subOut,
          }}
        >
          <div
            style={{
              width: 170 * prog(frame, f(T.logo.subtitle), 30, ease.outExpo),
              height: 1.5,
              background: 'linear-gradient(90deg, transparent, rgba(167,180,194,0.7))',
            }}
          />
          <DecodeText
            text="GLOBAL TERMINAL"
            start={f(T.logo.subtitle)}
            duration={22}
            seed={4}
            style={{ font: `600 30px/1 ${MONO}`, letterSpacing: '0.62em', color: '#B4C1CD', marginRight: '-0.62em' }}
          />
          <div
            style={{
              width: 170 * prog(frame, f(T.logo.subtitle), 30, ease.outExpo),
              height: 1.5,
              background: 'linear-gradient(90deg, rgba(167,180,194,0.7), transparent)',
            }}
          />
        </div>
      ) : null}

      <AbsoluteFill style={{ background: '#DFFFEF', opacity: flash, mixBlendMode: 'screen' }} />
    </AbsoluteFill>
  );
};

const Sparks: React.FC<{ frame: number; x: number; y: number }> = ({ frame, x, y }) => {
  const age = frame - LAND;
  if (age < 0 || age > 46) return null;
  return (
    <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: 30 }).map((_, i) => {
        const ang = rand(3, i) * Math.PI * 2;
        const speed = 7 + rand(5, i) * 16;
        const life = 26 + rand(7, i) * 20;
        const t = age / life;
        if (t >= 1) return null;
        const d = speed * age * (1 - 0.45 * t);
        const px = x + Math.cos(ang) * d * 1.6;
        const py = y + Math.sin(ang) * d * 0.8;
        return <circle key={i} cx={px} cy={py} r={2.4 * (1 - t) + 0.6} fill={i % 3 ? C.green : '#EFFFF6'} opacity={1 - t} />;
      })}
    </svg>
  );
};

/**
 * The green O itself during the fly-through — drawn above the product layer
 * so its counter frames the reveal.
 */
export const PortalO: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < PORTAL_IN || frame > PORTAL_OUT + 1) return null;
  const o = oCenter(frame);
  const k = K * logoZoom(frame);
  const late = prog(frame, PORTAL_OUT - 8, 8, ease.inCubic);
  // O glyph centre in font units is (300, 365): place it on the screen centre point.
  return (
    <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <defs>
        <filter id="portalGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={8 + 30 * late} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={glyphPath('O')}
        transform={`translate(${(o.x - 300 * k).toFixed(2)} ${(o.y + 365 * k).toFixed(2)}) scale(${k} ${-k})`}
        fill={C.green}
        opacity={1 - late * 0.85}
        filter="url(#portalGlow)"
      />
    </svg>
  );
};
