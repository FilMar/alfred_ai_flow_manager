# Roadmap

---

## Phase 1: Third Brain — Completamento
**Status:** 🚧 In Progress

### Obiettivo
Portare il Third Brain a uno stato pienamente utilizzabile: grafo associativo immutabile, navigazione senza query semantica, e agenti cognitivi completi per il flusso serale.

### 1A — Refactor a CLI

- [x] **CLI entry point** (`src/cli.ts`): Binario `third-brain` con sottocomandi `save`, `search`, `update`, `browse`, `start`, `stop`, `status`. `"bin": { "third-brain": "./src/cli.ts" }` aggiunto in `package.json`. L'extension pi (`src/index.ts`) resta come thin wrapper.

- [x] **`third-brain start` / `stop` / `status`**: Lifecycle Qdrant via `docker compose -f packages/third-brain/compose.qdrant.yml`. `start` attende che Qdrant sia raggiungibile e avvisa se Ollama o il modello mancano. Compatibile Docker e Podman via `podman-docker`.

- [x] **Health check su ogni comando**: `requireServices()` controlla Qdrant e Ollama prima di ogni operazione. Exit code 1 con suggerimento `third-brain start`.

- [x] **`third-brain save`**: Flag `--what`, `--why`, `--kind`, `--tags` (ripetibile), `--source`. Output JSON (id, seed, messaggio serendipità).

- [x] **`third-brain search`**: Argomento posizionale `<query>`. Flag `--limit`, `--depth`, `--hybrid`, `--tags`, `--kind`, `--evidence-only`, `--include-hubs`. Output JSON array.

- [x] **`third-brain update`**: Argomento posizionale `<id>`. Flag `--kind`, `--add-ref <id:reason>` (ripetibile, append-only — legge i refs esistenti e li estende). Output JSON con patch applicata.

- [x] **`third-brain browse`**: Flag `--kind`, `--since` (ISO date), `--limit` (default 20). Usa Qdrant scroll API. Output JSON array.

- [x] **Aggiornare SKILL.md esistenti** (Oracolo, Platone) per documentare i comandi CLI al posto dei tool names. `allowed-tools: Bash`, comandi documentati con firma completa.

### 1B — Core del grafo

- [x] **`backrefs`**: Campo `backrefs?: string[]` aggiunto a `Note` in `types.ts`. Gestito automaticamente da `notes.ts.appendBackref()` — chiamata da `createNote` e `addRefs`.

- [x] **`refs` append-only con limite 6**: `REFS_LIMIT = 6` in `types.ts`. Validazione in `notes.ts.addRefs()` con errore esplicito che suggerisce di consolidare in un Hub.

- [x] **Refactor dominio in `notes.ts`**: Unica API pubblica del dominio (`createNote`, `addRefs`, `changeKind`, `searchNotes`, `browseNotes`, `getNotes`). `qdrant.ts` è puro layer dati (`upsert`, `setPayload`, `getByIds`, `search`, `scroll`, `randomNoteId`). Grafo dipendenze: `cli → notes → qdrant`. Nessuna dipendenza circolare.

- [x] **Hub escluse dalla ricerca diretta**: `buildSearchFilter` in `qdrant.ts` esclude `kind: "indice"` via `must_not` per default. Parametro `include_hubs?: boolean` aggiunto a `SearchOptions` e al comando `third-brain search --include-hubs`.

### 1C — Navigazione

- [x] **`third-brain browse`**: Comando CLI per navigare la memoria senza query semantica. Parametri: `--kind`, `--since` (ISO date), `--limit` (default 20). Usa Qdrant scroll API via `notes.ts.browseNotes()`.

### 1D — Agenti cognitivi

- [ ] **Socrate (Provocatore — Elenchos)**: Skill di attrito cognitivo. Prende un'idea in input, interroga il Third Brain cercando contraddizioni e lacune nei `refs` e `backrefs`, formula la domanda scomoda senza mai chiudere il ragionamento al posto dell'utente. L'obiettivo è creare tensione che richieda la consultazione dell'Antinet. Comandi consentiti: `third-brain search`, `third-brain browse`. Posizione: `packages/third-brain/skills/socrate/SKILL.md`.

- [ ] **Aristotele (Curatore della Sintesi)**: Skill di codifica della conoscenza elaborata. Usa `third-brain browse` per trovare cluster densi, crea Hub (`kind: "indice"`) con `third-brain save`, aggiunge refs dalle note sorgente alla Hub con `third-brain update`. Integra le risposte dell'utente post-Antinet promuovendo materiale grezzo a conoscenza elaborata. Comandi consentiti: `third-brain search`, `third-brain browse`, `third-brain save`, `third-brain update`. Posizione: `packages/third-brain/skills/aristotele/SKILL.md`.

### 1E — Flusso Serale

- [ ] **Flusso Serale (loop)**: Aggiornare la skill di Alfredo per includere il flusso serale: `Utente propone idea → Socrate interroga DB → domanda scomoda → Utente su Antinet → Aristotele integra risposta nel DB → Socrate verifica tensione → (ripeti)`.

---

