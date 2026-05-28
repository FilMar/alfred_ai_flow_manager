# Roadmap

---

## Phase 1: Third Brain ✅
**Status:** Completato

CLI `tb` con save, search, update, browse, random, tags, graph. Grafo associativo immutabile con backrefs, hybrid search, Hub. Agenti cognitivi completi: Platone, Debate, Oracolo, Socrate, Aristotele.

---

## Phase 2: Third Hand (`th`) — Flow Engine
**Status:** 🚧 In Progress

### Obiettivo
Costruire un sistema di orchestrazione di agenti con identità cognitive divergenti (cappelli de Bono), flow di esecuzione configurabili, valutazione delle performance e ciclo evolutivo suggerito.

La CLI si chiama `th` (Third Hand), simmetrica a `tb`. I cappelli de Bono vivono in `tools/th/hats/`. I membri del progetto in `.th/members/`, i membri temporanei in `/tmp/.th/members/`.

### 2A — Membro ✅

- [x] **`th member create <name>`**: Crea un membro con `--hat`, `--role`, `--tools`, `--skills`. Persiste in `.th/members/<name>.md` come frontmatter + system prompt (ruolo + hat).
- [x] **`--tmp`**: Flag opzionale — salva il membro in `/tmp/.th/members/` invece del progetto. Utile per membri usa-e-getta.
- [x] **`th member list [--all]`**: Lista membri del progetto corrente; `--all` include anche i temporanei.
- [x] **`th member get <name>`**: Dettaglio JSON di un membro.
- [x] **`th member delete <name>`**: Elimina un membro.
- [x] **Risoluzione membro**: `loadMember()` cerca prima in `.th/members/`, poi in `/tmp/.th/members/`. Lettura singola — restituisce member + system prompt insieme.
- [x] **`th hats list`**: Lista i cappelli disponibili.
- [x] **`th hats get <name>`**: Mostra il contenuto di un cappello.
- [x] **Validazione input**: Nome membro limitato a `[a-zA-Z0-9_-]` — blocca path traversal. Role non può contenere newline.
- [x] **YAML list format**: `parseList()` gestisce sia `[a, b]` inline che `- item` multi-riga.
- [x] **`TH_HATS_DIR`**: Env var opzionale per override della directory hats (utile per binary compilati).

### 2B — Esecuzione singola ✅

- [x] **`th run --member <name> --task "..."`**: Carica il membro, chiama `createAgentSession()` con system prompt override (ruolo + hat), tools e skills del membro. Streaming su stdout. `SessionManager.inMemory()`.
- [x] **`--thinking <level>`**: Abilita extended thinking (off, minimal, low, medium, high, xhigh). Il reasoning interno viene reindirizzato in `/tmp/th-<member>-<timestamp>.log`; stdout riceve solo il risultato finale.
- [x] **`--model <provider/id>`**: Sceglie il modello da usare (es. `anthropic/claude-opus-4-7`). Facoltativo — default dal settings di pi.
- [x] **`--output <file>`**: Salva il risultato su file oltre che su stdout. Utile per passare l'output tra membri in esecuzione sequenziale.
- [x] **`--timeout <secondi>`**: Aborta la sessione con `session.abort()` se il run supera il limite. Validazione: intero positivo — errore esplicito su input non valido.
- [x] **`--detach`**: Esegue in background; ritorna subito `{ pid, out, log, status }`. Il processo figlio scrive lo status (`running` → `done` / `error: ...`) e l'output su file in `/tmp`.
- [x] **`th models`**: Lista i modelli disponibili con API key configurata.
- [x] **File descriptor safety**: `try/finally` garantisce la chiusura dei fd di log e output anche in caso di errore o abort.
- [x] **Sandbox bwrap**: Ogni `th run` viene automaticamente eseguito dentro un container bwrap se disponibile. Filesystem read-only tranne `cwd`, `~/.pi` e `/tmp`. L'agente non può scrivere fuori dal progetto.

### 2C — Tracking SQLite

- [ ] **Layer dati**: SQLite via Bun. Schema: `runs`, `member_outputs`.
- [ ] **`th history`**: Lista run passati con runId, membro, task, timestamp.
- [ ] **`th get <runId>`**: Output completo di un run.
- [ ] **Performance per membro**: metriche aggregate per cappello nel tempo (qualità output, token, durata).

---

## Phase 3: Integrazione Third Brain ✅
**Status:** Completato

Alfred interroga `tb search` prima di ogni flow. Platone è interattivo: propone nota + connessioni, utente conferma/modifica/aggiunge refs, poi salva. Feynman insegna il corpus con la tecnica Feynman.

- [x] **Platone interattivo**: propone nota + connessioni, aspetta conferma, applica modifiche, salva.
- [x] **Feynman**: recupera materiale TB su un argomento e lo insegna a tre livelli (nucleo / meccanismi / tensioni), dichiara i gap.

---

## Phase 4: GTD Task Manager (`td`) ✅
**Status:** Completato

CLI `td` (Third Done) con SQLite + colonna JSON per flessibilità senza migration. DB globale in `~/.pi/td.db`. Due tabelle: `projects` (id, name, start, goal_end, real_end, data) e `tasks` (id, list, project_id, done_at, created_at, data). Link tra task via array in `data.links`.

- [x] CLI `td` con `add`, `inbox`, `next`, `waiting`, `someday`, `list`, `move`, `done`, `get`
- [x] Gestione progetti: `td project add/list/done`
- [x] Symlink in `~/.local/bin/td` — setup.sh aggiornato
- [x] Skill `taiichi` — capture, processing inbox, sessioni di lavoro, weekly review

---

## Phase 5: Google Workspace (`gws`) ← prossima
**Status:** Pianificata

Layer comune basato su `gws` (Google Workspace CLI ufficiale) — un solo auth OAuth per tutti i servizi Google. Ogni skill usa `--dry-run` + conferma esplicita prima di operazioni distruttive (invia, cancella).

- [ ] **Setup `gws`**: installazione + auth OAuth con keyring di sistema
- [ ] **Skill calendario**: inserimento eventi, agenda, riorganizzazione slot, integrazione con Taiichi (*"schedula 2 ore per questo task"*)
- [ ] **Skill Gmail**: triage inbox, risposta, inoltro — con dry-run obbligatorio prima di ogni invio
- [ ] **Skill spese**: lettura e scrittura su Google Sheets — traccia entrate/uscite, aggregazioni mensili

---

## Phase 6: Career Coach ← dopo TB popolato
**Status:** Pianificata

Funziona meglio quando il TB è già ricco di storia e pattern personali. Da costruire dopo uso reale del sistema.

- [ ] Consulta il TB prima di ogni risposta (chi sei, cosa hai già provato, pattern)
- [ ] Consigli su come muoversi (pivot, focus, priorità di prodotto)
- [ ] Non generico — calibrato su storia e obiettivi reali dell'utente

---

## Phase 7: Tracking SQLite `th` ← quando serve misurare
**Status:** Pianificata

Utile ma non urgente. Ha senso dopo aver usato Alfred abbastanza da voler misurare le performance per cappello.

- [ ] Layer dati: SQLite via Bun. Schema: `runs`, `member_outputs`.
- [ ] **`th history`**: Lista run passati con runId, membro, task, timestamp.
- [ ] **`th get <runId>`**: Output completo di un run.
- [ ] Performance per membro: metriche aggregate per cappello nel tempo (qualità output, token, durata).

---

## Skills Operative

### Alfred (Orchestratore) ✅

Skill operativa che usa `th run` per orchestrare agenti con cappelli de Bono. Due pattern:
- **Sequenziale**: ogni membro legge l'output del precedente e ci costruisce sopra
- **Parallelo**: membri lanciati con `--detach`, poll sui file di output, poi sintetizzati dal Blu

### Platone (Accrescitore) ✅

Flow interattivo: propone nota (what, why, kind, tags) + connessioni trovate nel TB → utente conferma/modifica/aggiunge refs → salva. Una nota alla volta.

### Feynman (Professore del Corpus) ✅

Recupera materiale TB con query multiple, spiega a tre livelli (nucleo / meccanismi / tensioni), dichiara i gap esplicitamente. Complementare a Socrate: Feynman costruisce la comprensione, Socrate la stressa.

### Taiichi (GTD) ✅

Skill operativa per il GTD personale via `td`. Quattro momenti: capture → processing inbox → sessione di lavoro → weekly review.

### Emotion (Scrum PM — ClickUp) ✅

Skill per gestire il lavoro da Scrum PM su ClickUp nello space Sviluppo. Sprint, backlog, inbox: crea task, aggiorna stati e custom field, approfondisce description, commenta con menzioni, collega task tra loro. Workflow sprint: move (non add to list) — i task hanno il sprint come lista primaria, a fine sprint i chiusi restano come archivio, gli aperti tornano in backlog.

---
