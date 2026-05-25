# Roadmap

---

## Phase 1: Third Brain — Completamento
**Status:** 🚧 In Progress

### Obiettivo
Portare il Third Brain a uno stato pienamente utilizzabile: grafo associativo immutabile, navigazione senza query semantica, e agenti cognitivi completi per il flusso serale.

### 1A — CLI `tb`

- [x] **CLI entry point** (`tools/tb/src/cli.ts`): Binario `tb` con sottocomandi `save`, `search`, `update`, `browse`, `random`, `tags`, `start`, `stop`, `status`. Symlink in `~/.local/bin/tb`.

- [x] **`tb start` / `stop` / `status`**: Lifecycle Qdrant via `docker compose`. `start` attende che Qdrant sia raggiungibile e avvisa se Ollama o il modello mancano.

- [x] **Health check su ogni comando**: `requireServices()` controlla Qdrant e Ollama prima di ogni operazione. Exit code 1 con suggerimento `tb start`.

- [x] **`tb save`**: Flag `--what`, `--why`, `--kind`, `--tags` (ripetibile o comma-separated), `--source`. Output JSON `{ id }`. Serendipità separata (`tb random`).

- [x] **`tb search`**: Argomento posizionale `<query>`. Flag `--limit`, `--depth`, `--hybrid`, `--tags`, `--kind`, `--evidence-only`, `--include-hubs`. Output JSON array.

- [x] **`tb update`**: Argomento posizionale `<id>`. Flag `--kind`, `--add-ref <id:reason>` (ripetibile, append-only). Output `{ id, updated: true }`.

- [x] **`tb browse`**: Flag `--kind`, `--since` (ISO date), `--limit` (default 20). Usa Qdrant scroll API. Output JSON array.

- [x] **`tb random`**: Restituisce una nota casuale usando nearest-neighbor su vettore random normalizzato. O(log n), non richiede Ollama.

- [x] **`tb tags`**: Lista tutti i tag in uso ordinati per frequenza. Scroll paginato con payload `["tags"]`, aggregazione client-side.

### 1B — Core del grafo

- [x] **`backrefs`**: Campo `backrefs?: string[]` in `Note`. Aggiornato automaticamente da `appendBackref()` in `notes.ts` ad ogni `addRefs`.

- [x] **`refs` append-only con limite 6**: `REFS_LIMIT = 6`. Errore esplicito che suggerisce di consolidare in un Hub.

- [x] **Architettura a layer**: `cli → notes → qdrant → infra`. Nessuna dipendenza circolare. `qdrant.ts` è puro layer dati, `notes.ts` contiene tutta la business logic.

- [x] **Hub escluse dalla ricerca diretta**: `buildSearchFilter` esclude `kind: "indice"` via `must_not` per default. Override con `--include-hubs`.

- [x] **Hybrid search**: Dense + sparse (BM25-like) con RRF fusion via `--hybrid`.

### 1C — Agenti cognitivi

- [x] **Platone (Accrescitore della Memoria)**: Skill completa. Distillazione con Filtro di Feynman, vincoli di purezza semantica, regole tag (`tb tags` prima di scegliere, max 3, sostantivi singolari), regola `--source` (compila se fonte identificabile, ometti se conversazione), serendipità esplicita via `tb random` + `tb update --add-ref`.

- [x] **Debate (Orchestratore dialettico)**: Skill che gestisce il loop `Oracolo → Socrate → Utente → Aristotele → Oracolo → ripeti`. Sostituisce Alfred eliminato nel refactor.

- [x] **Socrate (Provocatore — Elenchos)**: Skill di attrito cognitivo. Interroga il Third Brain cercando contraddizioni, formula la domanda scomoda senza chiudere il ragionamento. Comandi: `tb search`, `tb browse`.

- [x] **Aristotele (Curatore della Sintesi)**: Skill di codifica della conoscenza elaborata. Crea Hub (`kind: "indice"`), aggiunge refs. Comandi: `tb search`, `tb browse`, `tb save`, `tb update`.

### 1D — Flusso Serale

- [x] **Oracolo**: Skill di recupero contestuale. Interroga il Third Brain su un argomento e restituisce ciò che è già stato appreso, senza interpretare — usata da Debate e come entry point per la sessione.

### 1E — Visualizzazione grafo

- [x] **`tb graph`**: Server HTTP locale con grafo fisico D3. Layout PCA 2D per posizionamento iniziale dei nodi, forze fisiche per stabilizzazione, WebSocket per highlight in tempo reale dei nodi coinvolti nell'ultima operazione.

---

## Phase 2: Ciclo cognitivo completo
**Status:** 🚧 In Progress

### Obiettivo
Il Third Brain non è più solo uno store — è un sistema che genera attrito, sintetizza pattern e accompagna il pensiero nel tempo.

### 2A — Agenti attivi nel loop serale

- [x] **Debate (Orchestratore dialettico)**: Loop `Oracolo → Socrate → Utente → Aristotele → Oracolo → ripeti`. Gestisce il ciclo completo di confronto con il grafo.

- [ ] **Flusso serale guidato**: Sequenza standardizzata di fine giornata — Oracolo apre con una tensione, Socrate interroga, Platone distilla e salva.

### 2B — Qualità del grafo

- [ ] **Merge di note duplicate**: Rilevamento di note semanticamente sovrapposte (`tb search` + soglia coseno) e merge guidato.

- [ ] **Decay / review**: Flag note non referenziate da tempo per revisione o archiviazione.

---

