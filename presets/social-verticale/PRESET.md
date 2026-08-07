# Preset verticale — reel da foto e video

Progetto Remotion `1080x1920` per Reels, Storie, TikTok e Shorts, costruito
attorno a materiale reale: le tue foto e i tuoi video, non screenshot di
interfacce.

Nasce come ponte verso [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft),
che è pensato per video di prodotto orizzontali su prodotti web. Qui restano le
parti che si trasferiscono — camera con keyframe interpolati, tipografia che
entra a scaletta, SFX — mentre il soggetto cambia: media reali, formato
verticale, testo tenuto fuori dalle zone occupate dall'interfaccia delle app.

## Partire

```bash
npm install
npm run dev                      # Studio, per montare guardando
npm run render                   # out/reel.mp4
```

In un ambiente headless (server, CI, sessione cloud) il render vuole
`chrome-headless-shell` e una concorrenza bassa:

```bash
npx remotion render src/index.ts Reel out/reel.mp4 --concurrency=1 \
  --browser-executable=/percorso/di/chrome-headless-shell
```

## Montare

Tutto il montaggio sta in `src/reel/manifest.ts`: una lista di shot, ognuno con
il file, la durata, il movimento di camera e il testo. I file vanno in
`public/media/`. Le tre immagini segnaposto servono solo a far girare il
progetto appena clonato: sostituiscile.

```ts
{
  kind: 'photo',
  src: 'media/sala-attesa.jpg',
  seconds: 3,
  cam: 'pan-right',
  kicker: 'InFormaMedica',
  title: 'Come si svolge\nla prima visita',
}
```

I movimenti disponibili sono in `CamMove`: `push-in`, `pull-out`, `pan-left`,
`pan-right`, `tilt-reveal`, `still`.

## Due cose che decidono se il reel funziona

**Il movimento esiste solo dove la foto eccede.** La camera non trasla
l'immagine: fa scorrere `object-position` dentro la parte già tagliata via dal
ritaglio 9:16. È il motivo per cui non compaiono mai bande nere ai bordi, ma
anche il motivo per cui una foto orizzontale scorre in larghezza e non in
altezza. Su materiale orizzontale usa `pan-left` e `pan-right`; `tilt-reveal`
funziona sulle foto verticali. Lo zoom funziona su tutto.

**Il testo non deve finire sotto i pulsanti.** `src/reel/SafeArea.tsx` definisce
i margini occupati da caption, CTA e colonna delle icone. Sono valori di lavoro
prudenti, non specifiche ufficiali: Instagram e TikTok cambiano il layout spesso
e non pubblicano numeri stabili, quindi sono tarati larghi. Per controllare,
renderizza la composition `Reel-safe-area`, che disegna le zone in rosso.

## Audio

Il preset parte muto. `scripts/sync-audio.sh` copia in `public/audio/` una
traccia BGM e gli SFX dalla libreria video-shotcraft; poi metti `USE_BGM = true`
in `src/reel/Reel.tsx`. Per i punti in cui mettere gli effetti e come allinearli
al beat, le ricette sono in `references/music-beat-sync.md` e
`references/sound-design.md` della libreria.

Sui social vale una regola in più: la maggior parte delle visualizzazioni
avviene senza audio. La musica è un rinforzo, il testo a schermo deve reggere
il contenuto da solo.

## Da qui a Blotato

Il file che esce da `npm run render` è un `.mp4` H.264 1080x1920, che è quello
che i caricamenti di Instagram, TikTok e Facebook si aspettano. Da lì segue il
percorso della skill `social-informamedica`: caricamento del media, creazione
del post, programmazione.
