import React from 'react';
import { Composition } from 'remotion';
import { Reel } from './reel/Reel';
import { FPS, TOTAL_FRAMES } from './reel/manifest';

/** 1080x1920 è il formato di Reels, Storie, TikTok e Shorts.
 *  30 fps: 60 non porta niente su contenuti così e raddoppia il tempo di render. */
export const Root: React.FC = () => (
  <>
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ showSafeArea: false }}
    />
    {/* Stessa cosa con le zone dell'interfaccia disegnate sopra: serve per
        controllare che nessun titolo finisca sotto i pulsanti. */}
    <Composition
      id="Reel-safe-area"
      component={Reel}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ showSafeArea: true }}
    />
  </>
);
