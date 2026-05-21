# Alfred — Storage SQLite

> Documento di architettura prodotto dal team **forge** (debate 0002). Descrive il passaggio da file-based a SQLite per i dati operativi di Alfred.

---

## Contesto

Alfred memorizza attualmente ogni debate su disco come tree di file:

```
.alfred/
  teams/
    <name>/
      manifest.json
      debates/
        0001_slug/
          thread.md
          summary.md
          debate.json
```

Il team **forge** ha analizzato questa architettura e propone di **mantenere i file solo per la configurazione** (`manifest.json`, `alfred_project.json`) e **spostare tutti i dati operativi in un database SQLite locale** (`.alfred/alfred.db`).

Il database è gestito esclusivamente dal **processo orchestratore** di Alfred. I singoli membri di un team **non accedono mai al DB**.

---

## Perché SQLite

| Problema con i file | Come lo risolve SQLite |
|---|---|
| Query cross-team impossibili | `SELECT ... FROM debates` filtra per `team` |
| Thread non cercabili a pieno testo | `FTS5` su `debate_entries.content` |
| Nessuna metrica storica | Colonne `duration_ms`, `exit_code`, `error_message` per ogni turno |
| Report statici (`thread.md`) | Generati on-demand dal DB |
| Sync fragile (3 file per debate) | Transazione ACID atomica |

Il database è **locale al progetto** (`.alfred/alfred.db`), usa `node:sqlite` (built-in in Node.js 22+, non richiede dipendenze aggiuntive) e viene inizializzato *lazy* al primo `alfred_run`.

---

## Schema

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS debates (
  id TEXT PRIMARY KEY,                 -- "0001_feature-auth"
  team TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  flow TEXT NOT NULL,                  -- JSON serializzato
  request_title TEXT NOT NULL,
  request_prompt TEXT NOT NULL,
  created_at TEXT NOT NULL,            -- ISO 8601
  closed_at TEXT,                      -- NULL finché il run è attivo
  summary TEXT,                        -- sintesi prodotta dall'orchestratore
  UNIQUE(team, sequence)
);

CREATE INDEX IF NOT EXISTS idx_debates_team_sequence ON debates(team, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_debates_created_at ON debates(created_at DESC);

CREATE TABLE IF NOT EXISTS debate_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id TEXT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  turn_order INTEGER NOT NULL,       -- ordinamento affidabile (timestamp non lo è per step paralleli)
  author TEXT NOT NULL,                -- member.id o "alfred"
  content TEXT,                        -- output del turno
  timestamp TEXT NOT NULL,
  duration_ms INTEGER,               -- quanto ha impiegato il turno
  exit_code INTEGER,
  error_message TEXT                   -- NULL = successo
);

CREATE INDEX IF NOT EXISTS idx_entries_debate ON debate_entries(debate_id, turn_order);
CREATE INDEX IF NOT EXISTS idx_entries_author  ON debate_entries(author, timestamp DESC);

-- Full-text search (popolato dopo la transazione, non via trigger)
CREATE VIRTUAL TABLE IF NOT EXISTS debate_entries_fts USING fts5(
  debate_id UNINDEXED,
  author    UNINDEXED,
  content,
  content=debate_entries,
  content_rowid=id
);
```

---

## Cosa resta su file

| File | Ruolo | Perché rimane file |
|---|---|---|
| `.alfred/alfred_project.json` | Metadata progetto | Config, non dati operativi |
| `.alfred/teams/<name>.json` | Manifest team + membri | Leggibile, versionabile con git, diffabile |

> **Nota**: con i `debates/` scomparsi, i team si appiattiscono da `.alfred/teams/<name>/manifest.json` a `.alfred/teams/<name>.json`.

I vecchi `debate.json`, `thread.md`, `summary.md` **vengono eliminati**. Gli export Markdown vengono generati on-demand dal DB quando richiesto.

---

## Chi tocca il DB

**Solo il processo orchestratore** (`packages/alfred/src/index.ts` e `packages/alfred/src/db.ts`).

I membri del team sono **processi spawnati separati**: ricevono una stringa (system prompt + thread formattato) e restituiscono una stringa. Non hanno accesso a `node:sqlite`, non fanno query, non scrivono righe.

### Flusso di un debate (sintesi)

```
Orchestratore crea riga in `debates` (BEGIN)
  │
  ▼ spawn A con prompt + thread vuoto
  A produce output X ──────┐
                           │
  ▼ Orchestratore INSERT in `debate_entries` (A, X, durata, exit_code)
  │
  ▼ Orchestratore SELECT entries di questo debate → formatta thread
  ▼ spawn B con prompt + thread aggiornato
  B produce output Y ──────┐
                           │
  ▼ Orchestratore INSERT in `debate_entries` (B, Y, durata, exit_code)
  │
  ▼ Orchestratore UPDATE debates SET closed_at = NOW() (COMMIT)
```

Ogni turno viene **persistito immediatamente** (non alla fine del debate). Se il run crasha o viene interrotto, i turni già completati sono nel DB.

Per i **passaggi paralleli** (`[A, B]`), l'orchestratore fa uno snapshot del thread prima dello spawn, poi inserisce le due righe in sequenza (l'ordine tra A e B è deterministico dalla Promise resolution, ma entrambi vedono lo stesso snapshot iniziale).

---

## Decisioni chiave (team forge)

| Decisione | Motivazione |
|---|---|
| **DB lazy init** | `alfred_init` resta leggero (solo config). Il DB si crea al primo run con `PRAGMA user_version` per migration future. |
| **`turn_order` invece di `id` puro** | Due step paralleli possono avere lo stesso timestamp al millisecondo. `turn_order` garantisce ordine deterministico. |
| **Nessuna tabella `team_members` nel DB** | Il manifest rimane su file. Il DB conosce solo `author` come stringa libera (`"alfred"` non è un membro del manifest). |
| **Nessuna FK su `author`** | `"alfred"` (l'orchestratore) compare come autore in casi di errore parallelo. Una FK violerebbe subito. |
| **FTS5 popolato post-transazione** | I trigger FTS5 creano race condition su write concorrenti. Si fa `INSERT INTO debate_entries_fts SELECT ...` dopo la transazione principale. |
| **Sync write wrappate in `async`** | `DatabaseSync` è sincrono, ma le operazioni costano <5ms in un contesto dove il LLM impiega 10-20s. Accettabile. `withTransaction()` implementa retry con exponential backoff per sicurezza. |
| **Vecchi `debate.json` ignorati** | `loadDebate()` prova prima il DB, poi cade back su file. Nessuno script di migration: i vecchi debate restano leggibili ma non tracciati in analytics. |

---

## File coinvolti nell'implementazione

| File | Azione |
|---|---|
| `src/db.ts` | **Nuovo** — init schema, `getDb()`, `saveDebate()`, `loadDebate()`, query stats, `withTransaction()` |
| `src/reporting.ts` | **Nuovo** — genera report Markdown, JSON, thread formattato on-demand dal DB |
| `src/types.ts` | **Modifica** — `AgentTurnResult` += `duration_ms`; `DebateEntry` += `turn_order`, `duration_ms`, `exit_code`, `error_message` |
| `src/flow-runner.ts` | **Modifica** — passa istanza DB, cattura timing per turno, scrive nel DB dopo ogni `runAgentTurn` |
| `src/fs.ts` | **Modifica** — rimuove `saveDebate`/`loadDebate` file-based; mantiene solo `saveTeam`/`loadTeam`/`saveProject`/`loadProject` (appiattiti su `.json`) |
| `src/index.ts` | **Modifica** — `alfred_run` usa DB, lazy init; `alfred_init` senza DB; opzionale `alfred_report` |

---

## Modello di persistenza: write per turno

Ogni singolo turno (membro che risponde) viene **scritto nel DB immediatamente** — non alla fine del debate.

### Confronto

| | Salva alla fine (oggi) | Salva per turno (proposto) |
|---|---|---|
| **Memoria** | `debate.thread[]` cresce per l'intero run | Costante, svuotata subito nel DB |
| **Crash/Interruzione** | Perdi tutto | Hai già i turni completati |
| **Recovery** | Rifai da capo | Ricarichi dal DB e riprendi |
| **Parallelismo** | Sync difficile | Ogni `runMember` scrive autonomamente |
| **Visibilità query** | Zero fino al COMMIT finale | Puoi interrogare il debate in corso |

### Flusso in `runMember` (estratto da `flow-runner.ts`)

```typescript
async function runMember(member, debate, db, threadSnapshot, signal) {
  const startMs = Date.now();
  let output: string, exitCode = 0, error: string | null = null;

  try {
    const result = await runAgentTurn(member, systemPrompt, debate.request.prompt, signal);
    output = result.output;
  } catch (err) {
    error = String(err);
    exitCode = 1;
    output = `[Error: ${error}]`;
  }

  // ⬇️ SCRITTO SUBITO (no transazione, crash-safe)
  const turnOrder = debate.thread.length;
  db.prepare(`
    INSERT INTO debate_entries
      (debate_id, turn_order, author, content, timestamp, duration_ms, exit_code, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    debate.id, turnOrder, member.id, output,
    new Date().toISOString(), Date.now() - startMs, exitCode, error
  );

  // La memoria serve solo per passare il thread al prossimo step
  debate.thread.push({ author: member.id, content: output });
}
```

Nota: il `debates` (metadata) viene invece aperto con `BEGIN` all'inizio di `alfred_run` e `COMMIT` alla fine, così un debate senza `closed_at` viene interpretato come **in corso**.

---

### Transazione `debates` (metadata):

Il `BEGIN`/`COMMIT` incornicia solo i **metadati** della tabella `debates`:
- `BEGIN` prima di `runFlow` (crea riga con `created_at`, nessun `closed_at`)
- `COMMIT` dopo `runFlow` (se successo: setta `closed_at`, il debate è "chiuso")

Gli `INSERT` in `debate_entries` avvengono **fuori da questa transazione**, in autonomia, turno per turno. Se il run crasha, i turni già scritti restano nel DB; il debate apparirà senza `closed_at` → interpretabile come "in corso o interrotto".

### Istanza DB: per-progetto

```typescript
const _dbByRoot = new Map<string, DatabaseSync>();

export function getDb(projectRoot: string): DatabaseSync {
  if (!_dbByRoot.has(projectRoot)) {
    const dbPath = path.join(alfredDir(projectRoot), 'alfred.db');
    const db = new DatabaseSync(dbPath);
    initSchema(db);
    _dbByRoot.set(projectRoot, db);
  }
  return _dbByRoot.get(projectRoot)!;
}
```

Nessun singleton globale — supporta multi-progetto nella stessa sessione.

### `turn_order` nei passaggi paralleli

Quando `[A, B]` girano in parallelo, `turn_order` è assegnato nell'ordine di completamento (`Promise.allSettled`). È **non-deterministico** (A può finire prima o dopo B), ma accettabile: un debate non è deterministico per design, e il ruolo del `turn_order` è garantire ordinamento interno, non riproducibilità cross-run.

### `withTransaction()` e retry

Wrappato solo per **query di analytics concorrenti** (letture). Per i write per-turno, nessun retry automatico: se un `INSERT debate_entries` fallisce, è un errore grave e il debate si interrompe.

- `alfred_run` funziona esattamente come prima per l'utente.
- Vecchi debate in `.alfred/teams/<name>/debates/` restano su disco e sono leggibili via fallback.
- Nuovi debate scrivono solo nel DB.
- `alfred_teams` continua a leggere i `.json` dei manifest — nessuna API surface cambia.

---

## Cosa NON è questo documento

- **Non** propone che i membri del team accedano direttamente al DB. Il DB è persistence dell'orchestratore, non piattaforma di messaggistica condivisa.
- **Non** propone team multipli che "chattano" in tempo reale sullo stesso DB. Il DB è un registro append-only; eventuali comunicazioni cross-team sono gestite dall'orchestratore che legge/scrive righe come mediatore.
