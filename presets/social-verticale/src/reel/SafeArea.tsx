/**
 * Zone occupate dall'interfaccia di Instagram e TikTok.
 *
 * I margini qui sotto sono valori di lavoro prudenti, non specifiche ufficiali:
 * le due app cambiano il layout spesso e non pubblicano numeri stabili. Sono
 * tarati larghi apposta — meglio un titolo un po' più in alto del necessario
 * che una parola coperta dal pulsante "Segui".
 *
 * `<SafeArea />` disegna le zone in rosso ed è solo per lo Studio: non finisce
 * nel render finale, a meno che tu non lo lasci montato di proposito.
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';

export const SAFE = {
  /** Sopra: nome account, audio, a volte l'header della app. */
  top: 240,
  /** Sotto: caption, CTA, barra di avanzamento. La zona più affollata. */
  bottom: 460,
  left: 80,
  /** Destra: colonna delle icone (like, commenti, condividi, profilo). */
  right: 200,
};

export const SafeArea: React.FC<{ show?: boolean }> = ({ show = false }) => {
  if (!show) return null;
  const band: React.CSSProperties = {
    position: 'absolute',
    background: 'rgba(255,0,0,0.16)',
    outline: '2px dashed rgba(255,0,0,0.5)',
  };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ ...band, top: 0, left: 0, right: 0, height: SAFE.top }} />
      <div style={{ ...band, bottom: 0, left: 0, right: 0, height: SAFE.bottom }} />
      <div style={{ ...band, top: SAFE.top, bottom: SAFE.bottom, left: 0, width: SAFE.left }} />
      <div style={{ ...band, top: SAFE.top, bottom: SAFE.bottom, right: 0, width: SAFE.right }} />
    </AbsoluteFill>
  );
};
