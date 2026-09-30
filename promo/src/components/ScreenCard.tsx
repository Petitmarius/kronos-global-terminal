import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from 'remotion';

import { C, FPS, SRC_H, SRC_W } from '../theme';
import { clamp } from '../lib/anim';

export type Pose = {
  x: number; // centre, screen px
  y: number;
  w: number;
  h: number;
  rx?: number; // degrees
  ry?: number;
  rz?: number;
  z?: number; // translateZ px
  radius?: number;
  opacity?: number;
  dim?: number; // 0..1 darkening of the content
};

/** Content camera: zoom (1 = cover) and the source-pixel point to centre on. */
export type Cam = { zoom: number; fx: number; fy: number };

export const FULL_CAM: Cam = { zoom: 1, fx: SRC_W / 2, fy: SRC_H / 2 };

/** One screen-recording clip, placed on the 1920x914 source canvas. */
export const Clip: React.FC<{ name: string; from: number; to: number; at: number }> = ({ name, from, to, at }) => (
  <Sequence from={from} durationInFrames={Math.max(1, to - from)} layout="none">
    <OffthreadVideo
      src={staticFile(`footage/${name}.mp4`)}
      trimBefore={Math.round(at * FPS)}
      muted
      style={{ position: 'absolute', left: 0, top: 0, width: SRC_W, height: SRC_H }}
    />
  </Sequence>
);

/** Maps a source-pixel point to card-local pixels for a given pose + camera. */
export const camTransform = (pose: Pose, cam: Cam) => {
  const base = Math.max(pose.w / SRC_W, pose.h / SRC_H);
  const s = base * Math.max(1, cam.zoom);
  const vw = pose.w / s;
  const vh = pose.h / s;
  const cx = clamp(cam.fx, vw / 2, SRC_W - vw / 2);
  const cy = clamp(cam.fy, vh / 2, SRC_H - vh / 2);
  const tx = pose.w / 2 - s * cx;
  const ty = pose.h / 2 - s * cy;
  return { s, tx, ty, map: (px: number, py: number): [number, number] => [tx + s * px, ty + s * py] };
};

/**
 * A floating glass screen in 3D space showing footage through a camera
 * (zoom/pan inside the card), with border light, depth shadow, a green
 * ambient glow and an optional light sweep.
 */
export const ScreenCard: React.FC<{
  pose: Pose;
  cam: Cam;
  blurX?: number;
  blurY?: number;
  shine?: number; // light-sweep progress 0..1 (outside = none)
  glow?: number; // 0..1 ambient green glow
  clipPath?: string;
  id: string;
  children: React.ReactNode; // footage (source coordinates)
  overlay?: (map: (x: number, y: number) => [number, number], s: number) => React.ReactNode;
  perspective?: number;
}> = ({ pose, cam, blurX = 0, blurY = 0, shine = -1, glow = 0.6, clipPath, id, children, overlay, perspective = 2400 }) => {
  const { s, tx, ty, map } = camTransform(pose, cam);
  const radius = pose.radius ?? 20;
  const opacity = pose.opacity ?? 1;
  const hasBlur = blurX > 0.3 || blurY > 0.3;
  const shadowA = 0.55 * opacity;
  return (
    <AbsoluteFill style={{ perspective, perspectiveOrigin: '50% 50%', clipPath, pointerEvents: 'none' }}>
      {hasBlur ? (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={`mb-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={`${blurX.toFixed(2)} ${blurY.toFixed(2)}`} />
          </filter>
        </svg>
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: pose.x - pose.w / 2,
          top: pose.y - pose.h / 2,
          width: pose.w,
          height: pose.h,
          transform: `translateZ(${pose.z ?? 0}px) rotateY(${pose.ry ?? 0}deg) rotateX(${pose.rx ?? 0}deg) rotateZ(${pose.rz ?? 0}deg)`,
          transformStyle: 'flat',
          borderRadius: radius,
          overflow: 'hidden',
          opacity,
          background: C.bg2,
          boxShadow: [
            `0 50px 140px rgba(0,0,0,${shadowA})`,
            `0 18px 40px rgba(0,0,0,${shadowA * 0.8})`,
            `0 0 ${120 * glow}px rgba(0,230,118,${0.16 * glow * opacity})`,
          ].join(', '),
        }}
      >
        <div style={{ position: 'absolute', inset: 0, filter: pose.dim ? `blur(${(pose.dim * 5).toFixed(2)}px)` : undefined }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: SRC_W,
              height: SRC_H,
              transformOrigin: '0 0',
              transform: `translate(${tx}px, ${ty}px) scale(${s})`,
              filter: hasBlur ? `url(#mb-${id})` : undefined,
            }}
          >
            {children}
          </div>
        </div>
        {pose.dim ? <AbsoluteFill style={{ background: `rgba(4,6,8,${pose.dim})` }} /> : null}
        {overlay ? <AbsoluteFill>{overlay(map, s)}</AbsoluteFill> : null}
        {/* glass: soft top highlight */}
        <AbsoluteFill
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 32%)',
            mixBlendMode: 'screen',
          }}
        />
        {shine >= 0 && shine <= 1 ? (
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0) 43%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0) 57%, transparent 100%)',
              backgroundSize: '220% 100%',
              backgroundPosition: `${(1 - shine) * 130 - 15}% 0`,
              mixBlendMode: 'screen',
            }}
          />
        ) : null}
        {/* border light */}
        <AbsoluteFill
          style={{
            borderRadius: radius,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.16)',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
