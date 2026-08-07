# claude-skills

Skill per Claude Code, tenute fuori dai repo di progetto così restano
riutilizzabili e non appesantiscono il codice delle applicazioni.

## Cosa c'è dentro

| Skill | A cosa serve |
|---|---|
| `skills/video-shotcraft` | video promo di prodotto con Remotion: 104 shot recipe cards, gallery di anteprime, template completo, 5 BGM e 149 SFX |

## Installare una skill

**Claude Code in locale** (Mac, CLI o app desktop) — cloni una volta e colleghi:

```bash
git clone https://github.com/doctorplastic79-cmd/claude-skills.git
mkdir -p ~/.claude/skills
ln -s "$(pwd)/claude-skills/skills/video-shotcraft" ~/.claude/skills/video-shotcraft
```

Da quel momento la skill è disponibile in ogni sessione, su qualsiasi progetto.
Per Codex il percorso è `~/.codex/skills/` invece di `~/.claude/skills/`.

**Claude Code sul web** — le sessioni remote caricano solo le skill che stanno
nel repository su cui stai lavorando, in `.claude/skills/`. Una skill che vive
qui non viene vista automaticamente da una sessione aperta su un altro repo:
va copiata in quel repo, oppure la chiedi alla sessione e la reinstalla al volo
da questo repository.

## Aggiungere una skill

Una skill è una cartella con dentro un `SKILL.md` che apre con un frontmatter
`name` + `description`: è la descrizione che decide quando l'agente la usa.
Metti la cartella sotto `skills/` e aggiungi una riga alla tabella qui sopra.

## Licenze

Ogni skill mantiene la licenza originale, nel file `LICENSE` della sua cartella.

- `video-shotcraft` — Apache-2.0, di [Vincentwei1021](https://github.com/Vincentwei1021/video-shotcraft).
  Gli asset audio hanno licenze proprie, elencate in
  `skills/video-shotcraft/assets/audio/ATTRIBUTION.md`.
