/**
 * Il montaggio del reel, in un posto solo.
 *
 * Ogni voce è uno shot. `seconds` è la durata a schermo; il totale è la durata
 * del reel. Su Instagram e TikTok i primi 2 secondi decidono se qualcuno resta:
 * il primo shot va scelto per quello, non per ordine cronologico.
 *
 * I file stanno in `public/media/`. Foto orizzontali vanno benissimo: la camera
 * le riempie in verticale ritagliando, e il movimento nasce proprio dal fatto
 * che c'è più immagine di quanta ne entri nell'inquadratura.
 */

export type CamMove =
  | 'push-in'      // entra lentamente: il default per un ritratto o un dettaglio
  | 'pull-out'     // parte stretto e rivela il contesto: buono per aprire
  | 'pan-left'     // scorre verso sinistra: ambienti, corridoi, sale d'attesa
  | 'pan-right'
  | 'tilt-reveal'  // scende dall'alto: facciate, insegne, spazi alti
  | 'still';       // fermo: usalo quando il soggetto si muove già da solo

export type Shot =
  | {
      kind: 'photo';
      src: string;          // relativo a public/, es. 'media/studio-1.jpg'
      seconds: number;
      cam: CamMove;
      /** Occhio: la foto viene ritagliata in 9:16. 0 = tieni il centro,
       *  -1 = tieni il bordo sinistro/alto, +1 = destro/basso. */
      anchorX?: number;
      anchorY?: number;
      kicker?: string;      // riga piccola sopra il titolo
      title?: string;       // il testo grande
    }
  | {
      kind: 'video';
      src: string;
      seconds: number;
      /** Da che secondo del file partire. */
      startFromSeconds?: number;
      anchorX?: number;
      anchorY?: number;
      kicker?: string;
      title?: string;
    };

export const FPS = 30;

/** Sostituisci con i tuoi file: questo è solo un montaggio d'esempio che
 *  gira con le immagini segnaposto incluse. */
export const SHOTS: Shot[] = [
  {
    kind: 'photo',
    src: 'media/placeholder-1.png',
    seconds: 2.5,
    cam: 'push-in',
    kicker: 'InFormaMedica',
    title: 'Il primo\nsecondo\ndecide',
  },
  {
    kind: 'photo',
    src: 'media/placeholder-2.png',
    seconds: 3,
    cam: 'pan-right',
    title: 'Foto orizzontali,\nritagliate in 9:16',
  },
  {
    kind: 'photo',
    src: 'media/placeholder-3.png',
    seconds: 3,
    cam: 'tilt-reveal',
    kicker: 'Come si usa',
    title: 'Un file,\nun montaggio',
  },
];

export const TOTAL_FRAMES = Math.round(
  SHOTS.reduce((sum, s) => sum + s.seconds, 0) * FPS,
);
