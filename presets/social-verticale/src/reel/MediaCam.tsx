/**
 * Camera 2.5D su foto e video, in verticale.
 *
 * Stessa idea del `PageCam` di video-shotcraft — keyframe interpolati con una
 * bezier, non un `scale()` lineare — ma su media reali invece che su screenshot
 * di pagine web, e con le dimensioni prese dalla composition invece che
 * inchiodate a 1920x1080.
 *
 * Il movimento nasce da `object-position`, non da una traslazione. È una
 * differenza che conta: l'elemento resta esattamente grande quanto il frame e
 * `object-fit: cover` ritaglia il media al suo interno, quindi far scorrere
 * `object-position` scorre dentro la parte di foto già tagliata via, e non
 * può mai scoprire il fondo. Traslando l'elemento, invece, alla fine della
 * panoramica entra una banda nera dal bordo.
 *
 * Conseguenza da tenere a mente: si può scorrere solo là dove la foto eccede.
 * Una foto orizzontale in un frame 9:16 eccede in larghezza — `pan-left` e
 * `pan-right` funzionano, `tilt-reveal` no. Una foto verticale il contrario.
 * Lo zoom invece funziona sempre.
 */
import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { CamMove } from './manifest';

/** px/py sono percentuali di object-position (0 = bordo sinistro/alto,
 *  100 = destro/basso). zoom 1 = ritaglio cover pieno; sotto 1 non si scende
 *  mai, altrimenti compare il fondo. */
type Key = { t: number; zoom: number; px: number; py: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const MOVES: Record<CamMove, Key[]> = {
  'push-in':     [{ t: 0, zoom: 1.0,  px: 50, py: 50 }, { t: 1, zoom: 1.16, px: 50, py: 46 }],
  'pull-out':    [{ t: 0, zoom: 1.20, px: 50, py: 52 }, { t: 1, zoom: 1.0,  px: 50, py: 50 }],
  'pan-left':    [{ t: 0, zoom: 1.06, px: 88, py: 50 }, { t: 1, zoom: 1.06, px: 12, py: 50 }],
  'pan-right':   [{ t: 0, zoom: 1.06, px: 12, py: 50 }, { t: 1, zoom: 1.06, px: 88, py: 50 }],
  'tilt-reveal': [{ t: 0, zoom: 1.06, px: 50, py: 8  }, { t: 1, zoom: 1.06, px: 50, py: 72 }],
  'still':       [{ t: 0, zoom: 1.02, px: 50, py: 50 }, { t: 1, zoom: 1.02, px: 50, py: 50 }],
};

/** I movimenti che non hanno una direzione propria seguono l'ancora scelta
 *  nello shot; quelli che ce l'hanno (le panoramiche) la ignorano. */
const FOLLOWS_ANCHOR: Record<CamMove, { x: boolean; y: boolean }> = {
  'push-in':     { x: true,  y: true },
  'pull-out':    { x: true,  y: true },
  'pan-left':    { x: false, y: true },
  'pan-right':   { x: false, y: true },
  'tilt-reveal': { x: true,  y: false },
  'still':       { x: true,  y: true },
};

const EASE = Easing.bezier(0.33, 0, 0.15, 1);
const clampPct = (v: number) => Math.max(0, Math.min(100, v));

export const MediaCam: React.FC<{
  src: string;
  durationInFrames: number;
  cam?: CamMove;
  /** Che parte tenere quando il ritaglio 9:16 taglia: -1 sinistra/alto, +1 destra/basso. */
  anchorX?: number;
  anchorY?: number;
  kind: 'photo' | 'video';
  startFromSeconds?: number;
}> = ({
  src,
  durationInFrames,
  cam = 'push-in',
  anchorX = 0,
  anchorY = 0,
  kind,
  startFromSeconds,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const keys = MOVES[cam];
  const follows = FOLLOWS_ANCHOR[cam];

  const t = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });

  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const seg = a.t === b.t ? 1 : (t - a.t) / (b.t - a.t);

  const zoom = Math.max(1, lerp(a.zoom, b.zoom, seg));
  const px = clampPct(lerp(a.px, b.px, seg) + (follows.x ? anchorX * 35 : 0));
  const py = clampPct(lerp(a.py, b.py, seg) + (follows.y ? anchorY * 35 : 0));

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${px}% ${py}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${px}% ${py}%`,
  };

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#000' }}>
      {kind === 'video' ? (
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={startFromSeconds ? Math.round(startFromSeconds * fps) : undefined}
          style={style}
          muted
        />
      ) : (
        <Img src={staticFile(src)} style={style} />
      )}
    </AbsoluteFill>
  );
};
