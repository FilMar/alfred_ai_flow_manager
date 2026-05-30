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

### 2C — Tracking SQLite ✅

- [x] **Layer dati**: SQLite via Bun (`~/.pi/th.db`). Schema: `runs` (id, member, task, started_at, finished_at, status, out_path, log_path).
- [x] **`th history [--member <name>] [--limit <n>]`**: Lista run recenti in ordine decrescente.
- [x] **`th get <runId>`**: Metadati + output del run se ancora disponibile su disco.
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
- [x] **`td edit <id>`**: Patch post-creazione di `what`, `context`, `due`, `notes`, `waiting-for`. Stringa vuota cancella il campo.
- [x] **`td search <query>`**: Ricerca per keyword sul JSON dei task. `--all` include completati.
- [x] Gestione progetti: `td project add/list/done`
- [x] Symlink in `~/.local/bin/td` — setup.sh aggiornato
- [x] Skill `taiichi` — capture, processing inbox, sessioni di lavoro, weekly review

---

## Phase 5: Career Coach ← dopo TB popolato
**Status:** Pianificata

Funziona meglio quando il TB è già ricco di storia e pattern personali. Da costruire dopo uso reale del sistema.

- [ ] Consulta il TB prima di ogni risposta (chi sei, cosa hai già provato, pattern)
- [ ] Consigli su come muoversi (pivot, focus, priorità di prodotto)
- [ ] Non generico — calibrato su storia e obiettivi reali dell'utente

---

## Phase 6: Metriche per cappello ← quando serve misurare
**Status:** Pianificata

Base dati già pronta (Phase 2C). Ha senso dopo aver usato Alfred abbastanza da voler misurare le performance per cappello.

- [ ] Metriche aggregate per membro/cappello: durata media, tasso errore, distribuzione status.
- [ ] `th stats [--member <name>]`: report sintetico su stdout.

---

## Skills Operative

### Annibale (Orchestratore) ✅

Orchestra agenti con cappelli de Bono via `th run`. Due pattern: sequenziale (output di uno diventa contesto del successivo) e parallelo (`--detach` + poll + sintesi). Flow ripetibili → script sh/ts. Flow predefiniti in `skills/annibale/flows/`.

### Platone (Accrescitore della Memoria) ✅

Flow interattivo: propone nota (what, why, kind, tags) + connessioni trovate nel TB → utente conferma/modifica/aggiunge refs → salva. Una nota alla volta.

### Feynman (Professore del Corpus) ✅

Recupera materiale TB con query multiple, spiega a tre livelli (nucleo / meccanismi / tensioni), dichiara i gap esplicitamente. Complementare a Socrate: Feynman costruisce la comprensione, Socrate la stressa.

### Socrate (Generatore di Attrito) ✅

Non risponde — interroga. Trova contraddizioni, lacune e assunzioni non dichiarate. Non chiude mai il ragionamento.

### Aristotele (Curatore delle Sintesi) ✅

Analizza il grafo TB, trova cluster densi e connessioni mancanti, crea Hub (kind: indice) per comprimere aree sature.

### Oracolo (Memoria) ✅

Recupera conoscenza dal TB su un argomento. Non interpreta, non consiglia — restituisce ciò che è sedimentato.

### Seneca (GTD) ✅

GTD personale via `td`. Quattro momenti: capture → processing inbox → sessione di lavoro → weekly review.

### Ermes (Estrattore) ✅

Estrae testo da qualsiasi fonte esterna: articoli web e transcript YouTube. Un solo punto d'ingresso per tutte le fonti.

### Indiana (Archeologia del Codice) ✅

Scava nei progetti software per estrarre pattern strutturali nascosti, debiti tecnici, decisioni architetturali sepolte. Non corregge — diagnostica.

### Prometeo (Creatore di Skill) ✅

Crea nuove skill, modifica e migliora quelle esistenti, misura le performance via eval e benchmark.

### Omero (Wiki Locale) ✅

Mantiene la wiki locale di qualsiasi progetto in `.wiki/`. Sintetizza i file del progetto, risponde a query sull'indice, esegue health-check (contraddizioni, pagine orfane, gap). Funziona per progetti tecnici e worldbuilding.

---
