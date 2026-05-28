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

## Phase 3: Integrazione Third Brain ← prossima
**Status:** Pianificata

Contestualizza ogni run `th` con la conoscenza sedimentata nel TB. Va fatto prima di usare Alfred seriamente.

- [ ] **Briefing via Oracolo**: Prima di ogni run, `th run --brief` interroga `tb search` e prepone il contesto al task.
- [ ] **Preservazione via Platone**: A run completato, `th run --preserve` distilla l'output nel TB via `tb save`.
- [ ] **Skill alfred aggiornata**: Referenziare i nuovi flag nella skill una volta implementati.

---

## Phase 4: GTD Task Manager ← dopo Phase 3
**Status:** Pianificata

Skill locale per project e task management stile GTD. Dati su SQLite. Collo di bottiglia operativo più immediato per un solo fondatore.

- [ ] Liste: inbox, next actions, progetti, waiting, someday
- [ ] Capture rapido di task dalla conversazione
- [ ] Sessioni di lavoro contestualizzate (2 ore di focus → cosa faccio?)
- [ ] Weekly review strutturata
- [ ] Integrazione con Third Brain per contestualizzare priorità rispetto agli obiettivi

---

## Phase 5: Calendario (Google Calendar) ← dopo GTD
**Status:** Pianificata

Skill dedicata alla gestione del tempo. Esegue le priorità che il GTD ha già stabilito — ha senso solo dopo.

- [ ] Inserimento eventi, scadenze, appuntamenti
- [ ] Riorganizzazione slot su richiesta
- [ ] Integrazione con GTD: *"schedula 2 ore per questo task"* → trova slot libero e lo piazza in calendario

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

### Platone (Accrescitore) — refactor interattivo

Attualmente Platone decide autonomamente framing e tag. Va reso interattivo: propone, l'utente conferma/modifica, poi salva. Il round di conferma è già apprendimento — leggere la proposta e riformulare il *why* forza a processare l'idea. L'utente può anche aggiungere connessioni (`refs`) che Platone non vedrebbe: link trasversali e non ovvi che Aristotele poi consolida.

Flow target:
1. Platone propone nota (what, why, kind, tags)
2. Propone connessioni trovate nel TB via ricerca semantica
3. Utente conferma/modifica, aggiunge refs che vede lui
4. Salva

### Feynman (Professore del Corpus)

Il TB è più grande di ciò che l'utente riesce a processare coscientemente — è un corpus, non una memoria personale. Feynman è l'interfaccia didattica: dato un argomento, recupera tutto il materiale rilevante dal TB e lo *insegna*, usando la tecnica Feynman come metodo (spiega semplice → identifica dove la spiegazione si rompe → approfondisce il gap).

Non presuppone che l'utente sappia già cosa c'è dentro. Caso d'uso tipico: inserisci 10 ore di trascrizioni/note su un tema, poi chiedi a Feynman di spiegartelo da zero — lui sintetizza il corpus in una spiegazione progressiva.

Complementare a Socrate: Feynman prima (costruisce comprensione dal corpus), Socrate dopo (stressa la comprensione sotto pressione).

### Emotion (Scrum PM — ClickUp)

Skill per gestire il lavoro da Scrum PM su ClickUp: sprint, liste, creazione e approfondimento task. Scope limitato allo spazio Emotion. Da definire: autenticazione API key, operazioni prioritarie (sprint board, task creation, task detail).

---
