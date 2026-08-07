/**
 * Il reel: gli shot del manifest, uno dopo l'altro.
 *
 * Gli stacchi si sovrappongono di 4 frame. È poco di proposito: su un reel un
 * dissolvenza lunga legge come esitazione, e i tagli netti sono quello che
 * tiene su la percentuale di visualizzazioni complete. Se vuoi transizioni
 * costruite — iris, wipe, page turn — le ricette stanno in
 * `references/shots/transition/` della libreria video-shotcraft.
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { FPS, SHOTS } from './manifest';
import { MediaCam } from './MediaCam';
import { Overlay } from './Type';
import { SafeArea } from './SafeArea';

const CROSSFADE = 4;

/** Metti un mp3 in public/audio/bgm.mp3 (vedi scripts/sync-audio.sh) e passa a true. */
const USE_BGM = false;

export const Reel: React.FC<{ showSafeArea?: boolean }> = ({ showSafeArea = false }) => {
  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {SHOTS.map((shot, i) => {
        const duration = Math.round(shot.seconds * FPS);
        const from = cursor;
        cursor += duration - (i < SHOTS.length - 1 ? CROSSFADE : 0);

        return (
          <Sequence key={i} from={from} durationInFrames={duration} name={`shot-${i + 1}`}>
            <MediaCam
              src={shot.src}
              kind={shot.kind}
              durationInFrames={duration}
              cam={shot.kind === 'photo' ? shot.cam : 'still'}
              anchorX={shot.anchorX}
              anchorY={shot.anchorY}
              startFromSeconds={shot.kind === 'video' ? shot.startFromSeconds : undefined}
            />
            <Overlay kicker={shot.kicker} title={shot.title} durationInFrames={duration} />
          </Sequence>
        );
      })}

      {USE_BGM ? <Audio src={staticFile('audio/bgm.mp3')} volume={0.35} /> : null}

      <SafeArea show={showSafeArea} />
    </AbsoluteFill>
  );
};
