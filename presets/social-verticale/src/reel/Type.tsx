/**
 * Testo sopra le foto.
 *
 * Due regole che vengono dalle aesthetic-rules di video-shotcraft e che qui
 * pesano ancora di più, perché un reel si guarda su un telefono in mano:
 * il testo entra una riga alla volta e mai tutto insieme, e non scende mai
 * sotto una dimensione leggibile a schermo piccolo. Il titolo qui è 92px su
 * 1080 di larghezza: sembra enorme in anteprima sul monitor, è giusto sul
 * telefono.
 *
 * Il velo scuro dietro non è decorazione: su una foto chiara il testo bianco
 * sparisce, e le foto di una clinica sono quasi sempre chiare.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { SAFE } from './SafeArea';

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif';

export const Overlay: React.FC<{
  kicker?: string;
  title?: string;
  durationInFrames: number;
}> = ({ kicker, title, durationInFrames }) => {
  const frame = useCurrentFrame();
  if (!kicker && !title) return null;

  const lines = (title ?? '').split('\n').filter(Boolean);

  const out = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames - 2],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* velo dal basso: tiene il contrasto senza spegnere la foto */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 38%, rgba(0,0,0,0) 62%)',
          opacity: out,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: SAFE.left,
          right: SAFE.right,
          bottom: SAFE.bottom,
          opacity: out,
        }}
      >
        {kicker ? (
          <div
            style={{
              fontFamily: SANS,
              fontSize: 34,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.82)',
              marginBottom: 18,
              opacity: interpolate(frame, [0, 8], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              transform: `translateY(${interpolate(frame, [0, 8], [10, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })}px)`,
            }}
          >
            {kicker}
          </div>
        ) : null}

        {lines.map((line, i) => {
          const start = 4 + i * 5; // le righe entrano a scaletta, non insieme
          const t = interpolate(frame, [start, start + 12], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: SANS,
                fontSize: 92,
                lineHeight: 1.06,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#fff',
                textWrap: 'balance',
                opacity: t,
                transform: `translateY(${(1 - t) * 26}px)`,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
