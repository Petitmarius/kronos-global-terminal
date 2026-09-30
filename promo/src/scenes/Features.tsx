import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { C, f, T } from '../theme';
import { ease, Key, kf } from '../lib/anim';
import { counterPath } from '../lib/glyphs';
import { Brackets, Ripple } from '../components/Atoms';
import { Caption, Hl } from '../components/Caption';
import { NavPill } from '../components/NavPill';
import { Cam, camTransform, Clip, Pose, ScreenCard } from '../components/ScreenCard';
import { PORTAL_IN, PORTAL_OUT, portalMap } from './logoLayout';
import { MONTAGE_CENTER } from './Montage';

// ---- cue frames ------------------------------------------------------------
const P_IN = PORTAL_IN;
const P_OUT = PORTAL_OUT;
const DROP = f(T.f1.drop);
const CANDLES = f(T.f1.candles);
const WHIP = f(T.f2.whip);
const LIMIT = f(T.f2.limitClick);
const POS = f(T.f2.positions);
const ROLL3 = f(T.f3.roll);
const US_CLICK = f(T.f3.usClick);
const PANEL = f(T.f3.panel);
const ROLL4 = f(T.f4.roll);
const CORR = f(T.f4.corr);
const MONT = f(T.montage.start);

// Hero pose of the main screen: right of frame, slightly turned toward the copy.
const MAIN: Pose = { x: 1360, y: 562, w: 1260, h: 600, rx: 3, ry: -9, rz: 0, z: 0, radius: 22 };

type Track = Partial<Record<keyof Pose, Key[]>>;
const posed = (frame: number, base: Pose, track: Track): Pose => {
  const p: Pose = { ...base };
  (Object.keys(track) as Array<keyof Pose>).forEach((k) => {
    (p as Record<string, number>)[k] = kf(frame, track[k] as Key[]);
  });
  return p;
};
const camAt = (frame: number, zoom: Key[], fx: Key[], fy: Key[]): Cam => ({
  zoom: kf(frame, zoom),
  fx: kf(frame, fx),
  fy: kf(frame, fy),
});

/** Motion blur from how far the camera's focal point travelled since last frame. */
const panBlur = (frame: number, pose: (fr: number) => Pose, cam: (fr: number) => Cam, gain = 0.3) => {
  const p = pose(frame);
  const a = camTransform(p, cam(frame));
  const b = camTransform(p, cam(frame - 1));
  return { x: Math.min(46, Math.abs(a.tx - b.tx) * gain), y: Math.min(46, Math.abs(a.ty - b.ty) * gain) };
};

// ---- card A: the trading terminal ----------------------------------------------
const poseA = (fr: number) =>
  posed(fr, MAIN, {
    x: [[P_IN, 960], [P_OUT, 960], [P_OUT + 46, MAIN.x, ease.outExpo], [ROLL3, MAIN.x - 14, ease.inOutSine]],
    y: [[P_IN, 540], [P_OUT, 540], [P_OUT + 46, MAIN.y, ease.outExpo], [ROLL3 - 8, MAIN.y], [ROLL3 + 12, -620, ease.inExpo]],
    w: [[P_IN, 1190], [P_OUT, 1920, ease.inCubic], [P_OUT + 46, MAIN.w, ease.outExpo]],
    h: [[P_IN, 670], [P_OUT, 1080, ease.inCubic], [P_OUT + 46, MAIN.h, ease.outExpo]],
    ry: [[P_OUT, 0], [P_OUT + 46, MAIN.ry!, ease.outExpo], [ROLL3, -7, ease.inOutSine]],
    rx: [[P_OUT, 0], [P_OUT + 46, MAIN.rx!, ease.outExpo], [ROLL3 - 8, MAIN.rx!], [ROLL3 + 12, 42, ease.inExpo]],
    radius: [[P_IN, 28], [P_OUT, 0], [P_OUT + 30, MAIN.radius!]],
    opacity: [[ROLL3 - 2, 1], [ROLL3 + 12, 0, ease.inCubic]],
    dim: [[WHIP + 8, 0], [WHIP + 30, 0.5], [POS - 12, 0.5], [POS, 0]],
  });
const camA = (fr: number) =>
  camAt(
    fr,
    [[P_IN, 1], [CANDLES - 14, 1], [WHIP - 10, 1.5, ease.inOutCubic], [WHIP + 8, 1.25, ease.inOutCubic], [POS - 12, 1.25], [POS, 1, ease.inOutCubic], [ROLL3, 1.1, ease.outCubic]],
    [[P_IN, 960], [CANDLES - 14, 960], [WHIP - 10, 850, ease.inOutCubic], [WHIP - 8, 850], [WHIP + 8, 1500, ease.inOutExpo], [POS - 12, 1500], [POS, 960, ease.inOutCubic], [ROLL3, 820]],
    [[P_IN, 457], [CANDLES - 14, 457], [WHIP - 10, 500, ease.inOutCubic], [WHIP + 8, 457], [POS, 457], [ROLL3, 500]],
  );

// Pop-out: the order ticket lifts off the terminal toward the viewer.
const TICKET = { cx: 1675, cy: 695, w: 478, h: 474 };
const poseTicket = (fr: number): Pose =>
  posed(fr, { x: 0, y: 0, w: 0, h: 0, radius: 16 }, {
    x: [[WHIP + 8, 1770], [WHIP + 34, 1452, ease.outExpo], [POS - 12, 1452], [POS + 2, 1770, ease.inCubic]],
    y: [[WHIP + 8, 700], [WHIP + 34, 572, ease.outExpo], [POS - 12, 572], [POS + 2, 700, ease.inCubic]],
    w: [[WHIP + 8, 392], [WHIP + 34, 566, ease.outExpo], [POS - 12, 566], [POS + 2, 392, ease.inCubic]],
    h: [[WHIP + 8, 389], [WHIP + 34, 561, ease.outExpo], [POS - 12, 561], [POS + 2, 389, ease.inCubic]],
    z: [[WHIP + 8, 0], [WHIP + 34, 150, ease.outExpo], [POS - 12, 150], [POS + 2, 0, ease.inCubic]],
    ry: [[WHIP + 8, -9], [WHIP + 34, -3, ease.outExpo]],
    rx: [[WHIP + 8, 3], [WHIP + 34, 1, ease.outExpo]],
    opacity: [[WHIP + 6, 0], [WHIP + 14, 1, ease.outCubic], [POS - 4, 1], [POS + 2, 0]],
  });
const camTicket = (fr: number): Cam => {
  const p = poseTicket(fr);
  return { zoom: p.w / TICKET.w / Math.max(p.w / 1920, p.h / 914), fx: TICKET.cx, fy: TICKET.cy };
};

// ---- card B: the global map ------------------------------------------------------
const rollIn = (at: number): Track => ({
  y: [[at - 6, 1680], [at + 18, MAIN.y, ease.outExpo]],
  rx: [[at - 6, -42], [at + 18, MAIN.rx!, ease.outExpo]],
  opacity: [[at - 6, 0], [at + 4, 1, ease.outCubic]],
});
const poseB = (fr: number) => {
  const r = rollIn(ROLL3);
  return posed(fr, MAIN, {
    x: [[ROLL3, MAIN.x], [ROLL4, MAIN.x - 16, ease.inOutSine]],
    y: [...r.y!, [ROLL4 - 8, MAIN.y], [ROLL4 + 12, -620, ease.inExpo]],
    rx: [...r.rx!, [ROLL4 - 8, MAIN.rx!], [ROLL4 + 12, 42, ease.inExpo]],
    ry: [[ROLL3, -10], [ROLL4, -7, ease.inOutSine]],
    opacity: [...r.opacity!, [ROLL4 - 2, 1], [ROLL4 + 12, 0, ease.inCubic]],
    dim: [[PANEL, 0], [PANEL + 18, 0.48], [ROLL4, 0.48]],
  });
};
const camB = (fr: number) =>
  camAt(
    fr,
    [[ROLL3 + 10, 1], [US_CLICK - 6, 1.38, ease.inOutCubic], [PANEL + 2, 1.38], [PANEL + 24, 1.22, ease.inOutCubic]],
    [[ROLL3 + 10, 960], [US_CLICK - 6, 640, ease.inOutCubic], [PANEL + 2, 640], [PANEL + 24, 1200, ease.inOutCubic]],
    [[ROLL3 + 10, 457], [US_CLICK - 6, 430, ease.inOutCubic], [PANEL + 24, 440, ease.inOutCubic]],
  );
// Pop-out: the United States country panel slides in like it does in the app.
const US_PANEL = { cx: 1698, cy: 385, w: 396, h: 430 };
const posePanel = (fr: number): Pose =>
  posed(fr, { x: 0, y: 0, w: 515, h: 559, radius: 16 }, {
    x: [[PANEL, 2180], [PANEL + 24, 1500, ease.outExpo], [ROLL4 - 12, 1500], [ROLL4 + 4, 2250, ease.inCubic]],
    y: [[PANEL, 590]],
    z: [[PANEL, 150]],
    ry: [[PANEL, -22], [PANEL + 24, -4, ease.outExpo]],
    rx: [[PANEL, 2]],
    opacity: [[PANEL, 0], [PANEL + 8, 1], [ROLL4 - 6, 1], [ROLL4 + 4, 0]],
  });
const camPanel = (): Cam => ({ zoom: 1.3 / Math.max(515 / 1920, 559 / 914), fx: US_PANEL.cx, fy: US_PANEL.cy });

// ---- card C: the macro dashboard ---------------------------------------------------
const poseC = (fr: number) => {
  const r = rollIn(ROLL4);
  const m = MONTAGE_CENTER;
  return posed(fr, MAIN, {
    x: [[ROLL4, MAIN.x], [MONT - 16, MAIN.x - 14, ease.inOutSine], [MONT, m.x, ease.inOutCubic]],
    y: [...r.y!, [MONT - 16, MAIN.y], [MONT, m.y, ease.inOutCubic]],
    w: [[MONT - 16, MAIN.w], [MONT, m.w, ease.inOutCubic]],
    h: [[MONT - 16, MAIN.h], [MONT, m.h, ease.inOutCubic]],
    rx: [...r.rx!, [MONT - 16, MAIN.rx!], [MONT, 0, ease.inOutCubic]],
    ry: [[ROLL4, -10], [MONT - 16, -7, ease.inOutSine], [MONT, 0, ease.inOutCubic]],
    radius: [[MONT - 16, MAIN.radius!], [MONT, m.radius!, ease.inOutCubic]],
    opacity: r.opacity!,
    dim: [[ROLL4 + 20, 0], [ROLL4 + 40, 0.5], [CORR - 10, 0.5], [CORR, 0]],
  });
};
const camC = (fr: number) =>
  fr < CORR
    ? camAt(fr, [[ROLL4 + 10, 1], [CORR, 1.12, ease.inOutSine]], [[ROLL4 + 10, 960]], [[ROLL4 + 10, 457], [CORR, 390, ease.inOutSine]])
    : camAt(
        fr,
        [[CORR, 1.42], [MONT - 16, 1.3, ease.outCubic], [MONT, MONTAGE_CENTER.cam.zoom, ease.inOutCubic]],
        [[CORR, 700], [MONT - 16, 660, ease.outCubic], [MONT, MONTAGE_CENTER.cam.fx, ease.inOutCubic]],
        [[CORR, 520], [MONT - 16, 540, ease.outCubic], [MONT, MONTAGE_CENTER.cam.fy, ease.inOutCubic]],
      );
// Pop-out: the Risk Barometer lifts off the dashboard.
const BARO = { cx: 512, cy: 255, w: 975, h: 266 };
const poseBaro = (fr: number): Pose =>
  posed(fr, { x: 0, y: 0, w: 0, h: 0, radius: 14 }, {
    x: [[ROLL4 + 22, 1072], [ROLL4 + 48, 1240, ease.outExpo], [CORR - 10, 1240], [CORR, 1072, ease.inCubic]],
    y: [[ROLL4 + 22, 430], [ROLL4 + 48, 396, ease.outExpo], [CORR - 10, 396], [CORR, 430, ease.inCubic]],
    w: [[ROLL4 + 22, 640], [ROLL4 + 48, 800, ease.outExpo], [CORR - 10, 800], [CORR, 640, ease.inCubic]],
    h: [[ROLL4 + 22, 175], [ROLL4 + 48, 218, ease.outExpo], [CORR - 10, 218], [CORR, 175, ease.inCubic]],
    z: [[ROLL4 + 22, 0], [ROLL4 + 48, 170, ease.outExpo], [CORR - 10, 170], [CORR, 0, ease.inCubic]],
    ry: [[ROLL4 + 22, -9], [ROLL4 + 48, -3, ease.outExpo]],
    rx: [[ROLL4 + 22, 3], [ROLL4 + 48, 2]],
    opacity: [[ROLL4 + 20, 0], [ROLL4 + 28, 1], [CORR - 4, 1], [CORR, 0]],
  });
const camBaro = (fr: number): Cam => {
  const p = poseBaro(fr);
  const base = Math.max(p.w / 1920, p.h / 914);
  return { zoom: p.w / BARO.w / base, fx: BARO.cx, fy: BARO.cy };
};

const shineAt = (frame: number, at: number, dur = 34) => (frame >= at && frame <= at + dur ? (frame - at) / dur : -1);

/**
 * 3.2 → 14 s. The product itself: one floating screen that travels
 * through the three views of KRONOS — Terminal, Global map, Macro —
 * with a detail panel lifting off the glass for each hero feature.
 */
export const Features: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < P_IN || frame > MONT) return null;

  const portal = frame < P_OUT ? `path('${counterPath(portalMap(frame), 1.22)}')` : undefined;

  const pA = poseA(frame);
  const cA = camA(frame);
  const blurA = panBlur(frame, poseA, camA, 0.32);
  const pB = poseB(frame);
  const pC = poseC(frame);

  const showA = frame < ROLL3 + 14;
  const showB = frame >= ROLL3 - 8 && frame < ROLL4 + 14;
  const showC = frame >= ROLL4 - 8;

  return (
    <AbsoluteFill style={{ clipPath: portal }}>
      {showA ? (
        <ScreenCard
          id="A"
          pose={pA}
          cam={cA}
          blurX={blurA.x}
          blurY={blurA.y}
          shine={Math.max(shineAt(frame, P_OUT + 24), shineAt(frame, CANDLES - 4))}
          overlay={(map, s) => {
            const [x0, y0] = map(338, 318);
            const [x1, y1] = map(1338, 700);
            return (
              <Brackets x={x0} y={y0} w={x1 - x0} h={y1 - y0} at={CANDLES - 2} until={WHIP - 16} label="LINE → CANDLES" arm={30 * Math.min(1, s * 1.4)} />
            );
          }}
        >
          <Clip name="terminal-candles" from={P_IN} to={WHIP} at={0.2} />
          <Clip name="terminal-order" from={WHIP} to={POS} at={1.0} />
          <Clip name="terminal-positions" from={POS} to={ROLL3 + 14} at={0} />
        </ScreenCard>
      ) : null}

      {frame >= WHIP + 6 && frame <= POS + 2 ? (
        <ScreenCard
          id="ticket"
          pose={poseTicket(frame)}
          cam={camTicket(frame)}
          glow={1}
          shine={shineAt(frame, WHIP + 26, 30)}
          overlay={(map) => {
            const [lx, ly] = map(1676, 520);
            return <Ripple x={lx} y={ly} at={LIMIT} color={C.amber} size={120} />;
          }}
        >
          <Clip name="terminal-order" from={WHIP} to={POS} at={1.0} />
        </ScreenCard>
      ) : null}

      {showB ? (
        <ScreenCard
          id="B"
          pose={pB}
          cam={camB(frame)}
          blurY={Math.min(30, Math.abs(poseB(frame).y - poseB(frame - 1).y) * 0.25)}
          shine={shineAt(frame, ROLL3 + 12)}
          overlay={(map) => {
            const [ux, uy] = map(610, 420);
            return <Ripple x={ux} y={uy} at={US_CLICK} color={C.green} size={140} />;
          }}
        >
          <Clip name="map-us" from={ROLL3 - 8} to={ROLL4 + 14} at={0.85 - 8 / 60} />
        </ScreenCard>
      ) : null}

      {frame >= PANEL && frame <= ROLL4 + 10 ? (
        <ScreenCard id="panel" pose={posePanel(frame)} cam={camPanel()} glow={1} shine={shineAt(frame, PANEL + 20, 30)}>
          <Clip name="map-us" from={ROLL3 - 8} to={ROLL4 + 14} at={0.85 - 8 / 60} />
        </ScreenCard>
      ) : null}

      {showC ? (
        <ScreenCard
          id="C"
          pose={pC}
          cam={camC(frame)}
          blurY={Math.min(30, Math.abs(poseC(frame).y - poseC(frame - 1).y) * 0.25)}
          shine={Math.max(shineAt(frame, ROLL4 + 12), shineAt(frame, CORR - 2, 30))}
        >
          <Clip name="macro-top" from={ROLL4 - 8} to={CORR} at={0.2} />
          <Clip name="macro-corr" from={CORR} to={MONT + 1} at={2.0} />
        </ScreenCard>
      ) : null}

      {frame >= ROLL4 + 20 && frame <= CORR ? (
        <ScreenCard id="baro" pose={poseBaro(frame)} cam={camBaro(frame)} glow={1} shine={shineAt(frame, ROLL4 + 44, 30)}>
          <Clip name="macro-top" from={ROLL4 - 8} to={CORR} at={0.2} />
        </ScreenCard>
      ) : null}

      {/* left-column copy */}
      <Caption
        index="01"
        label="TERMINAL"
        lines={['Pro charts.', <><Hl>Real</Hl> data.</>]}
        sub={['Stocks', 'FX', 'Crypto', 'Indices', 'Commodities']}
        inAt={DROP}
        outAt={WHIP - 8}
      />
      <Caption
        index="02"
        label="PAPER TRADING"
        lines={['Trade it all.', <>Risk <Hl>nothing.</Hl></>]}
        sub={['Market', 'Limit', 'Stop', 'SL / TP', 'Alerts']}
        inAt={WHIP + 4}
        outAt={ROLL3 - 8}
      />
      <Caption
        index="03"
        label="GLOBAL MAP"
        lines={[<><Hl>42</Hl> economies.</>, 'One live map.']}
        sub={['Indices', 'FX', 'World Bank macro']}
        inAt={ROLL3 + 4}
        outAt={ROLL4 - 8}
      />
      <Caption
        index="04"
        label="MACRO"
        lines={['The macro,', <Hl>decoded.</Hl>]}
        sub={['Risk barometer', 'Yield curve', 'VIX', 'Correlations']}
        inAt={ROLL4 + 4}
        outAt={MONT - 18}
      />

      <NavPill inAt={DROP + 6} outAt={MONT - 14} switches={[ROLL3, ROLL4]} />
    </AbsoluteFill>
  );
};
