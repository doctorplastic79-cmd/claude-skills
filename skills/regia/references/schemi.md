# Gli schemi di regia

Sei schemi. Si scelgono in base alla posta in gioco, non all'abitudine.

---

## 1. Staffetta — il caso normale

Brief → esecuzione → **verifica** → integrazione.

```bash
scripts/gpt chiedi --dir "/percorso/del/progetto" --file brief.md
```

Il terzo passo è quello che si tende a saltare, ed è l'unico che ti separa
dal riferire una cosa falsa. Verifica sempre almeno una cosa concreta:
esegui il codice, apri il file, controlla il percorso.

Quando usarlo: quasi sempre.

---

## 2. Officina — quando deve mettere le mani

```bash
scripts/gpt lavora --dir "/percorso/circoscritto" --file brief.md
```

L'esecutore scrive **solo** dentro quella cartella. Regole:

- La cartella dev'essere stretta: la sottocartella del progetto, non il
  progetto intero, e mai la home.
- Se non è un repo git, fai prima una copia di sicurezza di ciò che conta:
  non c'è un `git diff` a salvarti.
- **Guarda che cosa ha cambiato** prima di dire che è fatto:
  `ls -lt`, `diff`, o un `git status` se sei in un repo.
- Ricorda che `codex` esce **0** anche quando la sandbox ha respinto tutto.
  `gpt` te lo segnala, ma la prova è il filesystem, non il messaggio.

Quando usarlo: trasformazioni meccaniche su molti file, prime stesure di
codice da rifinire, generazione di materiale in una cartella dedicata.

---

## 3. Contraddittorio — prima di consegnare

Non chiedere "che ne pensi": chiedere un parere gentile produce un parere
gentile. Chiedi la demolizione.

```bash
scripts/gpt rivedi --dir "/percorso" --sforzo ultra --file demolisci.md
```

Nel brief:

```
Questo lo consegno fra dieci minuti. Il tuo compito non è migliorarlo:
è trovarmi il motivo per cui non dovrei consegnarlo.
Cerca l'errore che fa danno, non le imperfezioni di stile.
Se davvero non ce n'è, dillo in una riga: non inventarne per cortesia.
```

Poi **giudica tu il giudizio**: l'esecutore sbaglia anche quando critica, e
un rilievo plausibile non è un rilievo vero. Quello che sopravvive alla tua
verifica lo correggi; il resto lo scarti e lo dici.

Quando usarlo: prima di consegnare qualcosa di importante, e ogni volta che
ti accorgi di essere affezionato a una tua soluzione.

---

## 4. Doppia cieca — quando la risposta conta davvero

Lo stesso brief a due esecutori che non si vedono. Servono **due file**: il
numero di esecutori è il numero di `--brief`, non `--parallele` (che è solo
il tetto di quanti ne girano insieme).

```bash
cp brief.md /tmp/b1.md; cp brief.md /tmp/b2.md
scripts/gpt squadra --brief /tmp/b1.md --brief /tmp/b2.md --sforzo high
```

Poi confronti. **Dove divergono, lì c'è il problema**: o il brief era ambiguo
(colpa tua) o la domanda è davvero incerta — e allora va detto all'utente,
non nascosto scegliendo la risposta che piace di più.

**Dove concordano, invece, non hai dimostrato quasi niente.** Due esecuzioni
dello stesso modello, con lo stesso brief e le stesse lacune, condividono gli
stessi errori sistematici: l'accordo prova che lo sbaglio è *riproducibile*,
non che la risposta è giusta. Se leggi la concordanza come conferma, ti sei
costruito una falsa prova con le tue mani — ed è peggio di non aver
controllato affatto, perché adesso ti fidi.

La divergenza è informativa; la concordanza no. Per rafforzarla un poco:
due **modelli diversi** con `--modello` valgono più di due esecuzioni
identiche. Ma resta un indizio, non una verifica.

Quando usarlo: per far emergere l'ambiguità di una domanda o di un brief.

**Quando NON usarlo mai come prova:** qualunque cosa riguardi la salute di
una persona, un farmaco, una diagnosi, un referto, un dosaggio, o una scelta
che non si può disfare. Lì la verifica è una fonte clinica primaria o una
persona competente — non due AI che dicono la stessa cosa. Se l'utente ti
chiede una conferma di questo tipo, la risposta onesta è che questo
strumento non può dargliela.

---

## 5. Squadra — molte cose insieme

N brief indipendenti in parallelo. Misurato: tre richieste insieme costano
quanto una sola, non tre volte tanto.

```bash
scripts/gpt squadra --brief pezzo-uno.md --brief pezzo-due.md \
                    --brief pezzo-tre.md --parallele 3
```

- Il nome del file diventa il nome del lavoro nel registro: chiamali come i
  pezzi (`fatture.md`, `anagrafica.md`), non `b1.md`.
- Ogni brief dev'essere **autosufficiente**: gli esecutori non si parlano e
  non vedono i risultati degli altri.
- Se uno fallisce, gli altri arrivano lo stesso; il riepilogo dice quale.
- Non alzare `--parallele` oltre 3-4 senza motivo: oltre non è stato
  misurato, e il limite dell'abbonamento si aspetta, non si forza.

Quando usarlo: molte unità di lavoro simili e indipendenti.

---

## 6. Ping-pong — rifinire senza rispiegare

```bash
scripts/gpt chiedi --file brief.md
scripts/gpt continua --ultimo "Ora accorcia la sezione 2 alla metà."
scripts/gpt continua --ultimo "Togli l'ultimo esempio, è ridondante."
```

`--ultimo` riprende l'ultima sessione riuscita **nata nella stessa cartella**.
Il registro è unico per tutta la macchina: se due lavorazioni vanno avanti in
parallelo, «l'ultima» in assoluto potrebbe essere quella dell'altra, e la
continuazione sarebbe linguisticamente perfetta e riferita alla cosa
sbagliata. Se in questa cartella non c'è niente da riprendere, il comando si
ferma e ti chiede l'id esatto invece di indovinare.

Prima di proseguire, `gpt` stampa la prima riga del brief che sta riprendendo:
**leggila**. Se non è quella che ti aspetti, fermati. Per riprendere una
sessione precisa: `gpt lavori`, poi `--sessione <uuid>`.

Attenzione: il resume **non** eredita la cartella della sessione originale.
Se serve il contesto dei file, ripassa `--dir`.

Quando usarlo: rifinitura iterativa, dove rispiegare il contesto costerebbe
più della correzione.

---

## Come si combinano

Gli schemi si annidano. Le due combinazioni che rendono di più:

**Squadra + contraddittorio** — N esecutori producono, poi un esecutore
diverso deve demolire il risultato di ciascuno. È il modo economico di
tenere alta la qualità su molto materiale. Non c'è un comando unico: sono
due passaggi, e in mezzo ci sei tu.

```bash
# 1. producono
scripts/gpt squadra --brief pezzo-a.md --brief pezzo-b.md

# 2. per ognuno, un revisore che non sa chi l'ha scritto
for id in $(scripts/gpt lavori | awk '/pezzo-/ {print $1}'); do
    { echo "Demolisci il testo qui sotto. Cerca l'errore che fa danno,"
      echo "non le imperfezioni. Se non ce n'è, dillo in una riga."
      echo "---"
      cat ~/.regia/lavori/$id/risposta.md
    } | scripts/gpt rivedi --tag "critica-$id"
done
```

**Officina + verifica esterna** — uno scrive il codice in una cartella, un
altro (in sola lettura, senza sapere chi l'ha scritto) lo rivede. Il
secondo non è affezionato al lavoro del primo.

E in tutti i casi, l'ultimo anello sei tu: la firma sul risultato è la tua,
non la sua.
