# Scrivere il brief

L'esecutore è bravo. Non ti legge nel pensiero. Quasi tutti i fallimenti di
questa skill non sono fallimenti del modello: sono brief che non dicevano
che cosa si voleva.

## I cinque blocchi

```
OBIETTIVO
  Una frase. Che cosa deve esistere quando hai finito.
  Non "occupati di X": "produci Y fatto così".

CONTESTO
  Dove sono i file (percorsi veri, non descrizioni).
  Che cos'è questo progetto, in due righe.
  Che cosa ho già provato e perché non è bastato.

VINCOLI
  Cosa NON toccare.
  Lingua, tono, lunghezza.
  Versioni, librerie ammesse, stile del codice circostante.

FORMATO
  Come dev'essere fatta la risposta.
  Se ti serve per ciclarci sopra: lo schema JSON, e usa `gpt json`.

ACCETTAZIONE
  La lista di controllo con cui giudicherò il risultato.
  Se non riesci a scriverla, non hai ancora capito che cosa vuoi.
```

## Prima e dopo

**Brief povero**

```
Guarda il codice in strumenti/ e dimmi se ci sono problemi di sicurezza.
```

Ottieni un elenco generico di buone pratiche, per metà non pertinente, che
poi devi verificare tutto tu — e ti costa più tempo di quanto ne hai
risparmiato.

**Brief da regista**

```
OBIETTIVO
Trova i punti di strumenti/bin/registra in cui un manifesto JSON scritto
male può far eseguire un comando non voluto.

CONTESTO
`registra` è uno script Python che scrive manifesti JSON in una cartella di
configurazione. Quei manifesti contengono campi "azione" che l'applicazione
esegue poi come comandi di shell. A scriverli è un agente, non una persona.

VINCOLI
Solo lettura, non modificare niente. Solo questo file e ciò che importa.
Ignora i problemi teorici: mi interessa quello che si può innescare
davvero passando un manifesto.

FORMATO
Per ogni punto: file e riga, che input lo innesca, che cosa succede.
Ordinati dal più grave. Se non trovi nulla, dillo e basta.

ACCETTAZIONE
Ogni voce deve indicare un input concreto. Niente "andrebbe validato".
```

## Tre abitudini che cambiano la resa

**Dagli il pezzo di mondo, non il tuo riassunto.** `--dir` gli fa leggere i
file veri. Un tuo riassunto gli passa anche i tuoi fraintendimenti, e non
te ne accorgi perché lui li conferma.

**Chiedi il formato che serve a te.** Se il risultato deve entrare in un
ciclo, in una tabella o in un confronto, usa `gpt json --schema`: la
risposta arriva già validata e non devi ritagliarla dalla prosa.

**Scrivi l'accettazione prima di lanciare.** È il trucco più economico che
esista: costringe te a decidere, e dà a lui il bersaglio.

## Quando vuoi un giudizio, non un compito

Per i pareri serve una spinta esplicita al conflitto, altrimenti l'esecutore
è cortese e ti dà ragione:

```
Il testo qui sotto l'ho scritto io e sto per consegnarlo.
Il tuo compito NON è migliorarlo: è convincermi a non consegnarlo.
Trova il difetto peggiore, quello per cui il destinatario potrebbe
rifiutarlo. Se davvero non ce n'è uno, dillo in una riga e fermati:
non inventarne per cortesia.
```

Quest'ultima frase conta quanto le altre. Senza, ti inventa un difetto per
farti contento.

## Schemi JSON: piccoli e chiusi

Uno schema stretto fa metà del lavoro di verifica al posto tuo.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["verdetto", "motivi", "confidenza"],
  "properties": {
    "verdetto":   {"type": "string", "enum": ["si", "no", "non_deducibile"]},
    "motivi":     {"type": "array", "items": {"type": "string"}, "maxItems": 5},
    "confidenza": {"type": "number", "minimum": 0, "maximum": 1}
  }
}
```

Due accorgimenti: metti sempre `additionalProperties: false`, e prevedi
sempre una via d'uscita onesta (`non_deducibile`, `nessun_problema`). Uno
schema che ammette solo "sì" o "no" costringe a inventare.

## Quanto sforzo

`--sforzo` è quanto deve ragionare prima di rispondere. Costa tempo, non
soldi.

| | quando |
|---|---|
| `low` | meccanico: riformattare, estrarre, tradurre, generare varianti |
| `high` (default) | il lavoro vero: analisi, stesure, revisioni |
| `ultra` / `max` | il nodo difficile, il bug che non si trova, la decisione delicata |

Un brief mal scritto con `ultra` resta un brief mal scritto: il ragionamento
non ripara l'obiettivo mancante.

## Igiene

- Il brief esce dalla macchina. Niente password, chiavi, token, dati
  sanitari o dati personali di terzi. Se serve un segreto, passa il *nome*
  dell'elemento del Portachiavi, mai il valore.
- Non incollare interi file quando puoi passare `--dir`: leggerli è compito
  suo.
- Un brief lungo va in un file (`--file brief.md`), non sulla riga di
  comando: resta leggibile, si riusa, e finisce nel registro insieme alla
  risposta.
