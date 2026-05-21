# 🔴 ANALISI CRITICA: Punti di Rottura nella Migrazione SQLite

**Ruolo:** Software Correctness Engineer  
**Focus:** Race conditions, invarianti violati, assunzioni fragili

---

## 🚨 Rischi Critici Validati Sperimentalmente

### 1. **DatabaseSync NON è Multi-Process Safe (CONFERMATO)**

**Test Eseguito:**
- 2 processi Node.js scrivono sullo stesso DB
- P1 inizia transazione IMMEDIATE, simula 100ms di processing
- P2 prova a iniziare transazione 50ms dopo

**Risultato:**
```
[P1] Read value: 0
[P2] ERROR: ERR_SQLITE_ERROR   ← FALLIMENTO SILENZIOSO
[P1] Incremented to 1
Final value: 1 (expected: 2)
```

**Impatto su Alfred:**
- Se due `alfred_run` partono in parallelo (stesso progetto, branch diversi o test CI)
- Il secondo FALLISCE con errore generico
- Nessun retry automatico
- L'utente vede "database locked" senza context

**Scenario di Fallimento:**
1. Dev lancia `alfred_run team=backend task="implement auth"`
2. Nel frattempo, CI lancia `alfred_run team=backend task="run tests"`
3. Uno dei due riceve `ERR_SQLITE_ERROR`, salva 0 contributions
4. L'altro completa, ma le stats aggregate sono sbagliate

**Fix Necessario:**
```typescript
// db.ts
export function withTransaction<T>(
  db: DatabaseSync,
  fn: () => T,
  maxRetries = 5
): T {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      db.exec('BEGIN IMMEDIATE TRANSACTION');
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      
      if (err.code === 'ERR_SQLITE_ERROR' && err.message.includes('locked')) {
        if (attempt === maxRetries - 1) throw err;
        // Exponential backoff
        const delayMs = Math.min(100 * (2 ** attempt), 1000);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Transaction failed after retries');
}
```

---

### 2. **Schema FK Constraint Violato da Design Attuale**

**Problema:** Lo schema proposto da Timoteo include:
```sql
CREATE TABLE debate_entries (
  ...
  author TEXT NOT NULL,
  FOREIGN KEY(author) REFERENCES team_members(member_id)
);
```

**Ma il codice attuale scrive:**
```typescript
// flow-runner.ts (linea 56)
debate.thread.push({ 
  author: "alfred",  // ← NON è un member_id!
  timestamp: now(), 
  content: `[Parallel step failed: ${msg}]` 
});
```

**Altri autori non-member:**
- `"alfred"` (orchestrator errors)
- `"system"` (possibile in future features)
- `member.id` che non esiste più se il manifest.json cambia

**Test di Rottura:**
```sql
-- Inserisce entry con author="alfred"
INSERT INTO debate_entries (debate_id, author, ...) 
VALUES ('0001_test', 'alfred', ...);
-- ❌ FOREIGN KEY constraint failed
```

**Fix Necessario:**
- Rimuovere FK constraint su `author` (è una stringa libera, non un riferimento)
- OPPURE creare un enum `author_type` e separare:
  ```sql
  author_type TEXT CHECK(author_type IN ('member', 'system')),
  author_member_id TEXT,
  author_system_id TEXT,
  FOREIGN KEY(author_member_id) REFERENCES team_members(member_id)
  ```
  Ma questo complica OGNI query.

**Raccomandazione:** `author` rimane TEXT, no FK. Validazione a runtime.

---

### 3. **team_members Snapshot è una Time Bomb**

**Scenario:**
1. Creo team "backend" con membri [alice, bob, charlie]
2. Lancio debate 0001 → snapshot di alice, bob, charlie in `team_members`
3. Modifico manifest.json: cambio model di alice da gpt-4 a claude-3.5
4. Lancio debate 0002 → nuovo snapshot con model diverso

**Problema Attuale:**
```sql
SELECT member_id, model FROM team_members WHERE team_id='backend';
-- Ritorna:
-- alice | gpt-4        ← dal debate 0001
-- bob   | gpt-4
-- charlie | gpt-4
-- alice | claude-3.5   ← dal debate 0002  ⚠️ DUPLICATE!
-- bob   | gpt-4
-- charlie | gpt-4
```

**Il UNIQUE constraint `(team_id, member_id)` FALLISCE.**

**Radice del Problema:**
- `team_members` è snapshot, ma la PK `id` è auto-increment
- Inserisci lo stesso `(team_id='backend', member_id='alice')` due volte → CONSTRAINT violation

**Fix Necessario:**
```sql
-- Cambia PK da `id` a snapshot composita
CREATE TABLE team_members (
  team_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  debate_id TEXT NOT NULL,  -- ← snapshot legato al debate specifico
  hat TEXT NOT NULL,
  ...,
  PRIMARY KEY(team_id, member_id, debate_id),
  FOREIGN KEY(debate_id) REFERENCES debates(id)
);
```

Ogni debate ha il SUO snapshot. Query diventa:
```sql
SELECT * FROM team_members WHERE debate_id='0001_test';
```

Ma ora hai **data duplication** massiccia: 3 membri × 100 debate = 300 righe che ripetono le stesse config.

**Alternative:**
1. **Elimina `team_members` table** — leggi sempre dal manifest.json
2. **Audit log separato** — `team_changes(timestamp, team_id, member_id, field, old_value, new_value)`

---

### 4. **Performance Tracking Incomplete per Retry**

**Scenario:**
```typescript
// flow-runner.ts (linea 32)
async function runMember(...) {
  const result = await runAgentTurn(...);  // ← può fallire e ritentare internamente
  return result.output;
}
```

Se `runAgentTurn` implementa retry (es. dopo rate-limit 429):
- Attempt 1: 2000ms, 500 tokens → FAIL
- Attempt 2: 1800ms, 480 tokens → SUCCESS

**Cosa salvare?**
- **Solo attempt 2**: perdi visibilità sui fallimenti (utile per debugging)
- **Entrambi**: ma `debate_entries` ha 1 riga per turn, non per attempt

**Schema Attuale Proposto:**
```sql
CREATE TABLE debate_entries (
  duration_ms INTEGER,  -- ← solo ultimo attempt?
  error_message TEXT    -- ← solo ultimo errore?
);
```

**Fix Necessario:**
```sql
-- Separa "logical turn" da "physical attempts"
CREATE TABLE turn_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id TEXT NOT NULL,
  author TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  duration_ms INTEGER,
  token_input INTEGER,
  token_output INTEGER,
  error_message TEXT,
  success BOOLEAN NOT NULL,
  FOREIGN KEY(debate_id) REFERENCES debates(id)
);

CREATE TABLE debate_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id TEXT NOT NULL,
  author TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  content TEXT,
  -- Reference to the SUCCESSFUL attempt
  successful_attempt_id INTEGER,
  FOREIGN KEY(successful_attempt_id) REFERENCES turn_attempts(id)
);
```

Query: "quanti retry ha fatto alice nel debate 0001?"
```sql
SELECT author, COUNT(*) as attempts, SUM(success) as successes
FROM turn_attempts 
WHERE debate_id='0001_test' AND author='alice'
GROUP BY author;
```

---

### 5. **FTS5 Update Triggers Non Sono Atomici con Inserts**

**Schema Proposto (Timoteo):**
```sql
CREATE TRIGGER debate_entries_ai AFTER INSERT ON debate_entries BEGIN
  INSERT INTO debate_fts(...) VALUES (...);
END;
```

**Problema:** Se il trigger FALLISCE (es. FTS5 out of memory):
- L'insert principale in `debate_entries` è già COMMITTED
- Il DB è in stato inconsistente (entry esiste, ma non è searchable)
- Nessun rollback automatico

**Test di Rottura:**
```sql
-- Simula errore nel trigger
CREATE TRIGGER test_fail AFTER INSERT ON debate_entries BEGIN
  SELECT RAISE(FAIL, 'Trigger error simulation');
END;

INSERT INTO debate_entries (...) VALUES (...);
-- ❌ L'insert FALLISCE, MA potrebbe aver scritto dati parziali in altri trigger
```

**Fix Necessario:**
- Wrappa TUTTO in transazione esplicita nel codice:
```typescript
db.exec('BEGIN IMMEDIATE TRANSACTION');
try {
  db.prepare('INSERT INTO debate_entries ...').run(...);
  // FTS trigger fires here
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');  // ← rollback anche dei trigger
  throw err;
}
```

---

### 6. **Migration Ignorata = Perdita di Context Storico**

**Decisione Attuale:** "Ignore i debate esistenti su file"

**Impatto:**
- Req utente: "tracciare performance nel tempo"
- Ma "nel tempo" parte da OGGI (data deploy DB)
- I 9 debate legacy esistono ma sono INVISIBILI a tutte le query

**Scenario:**
```sql
-- Query: "mostra trend performance di alice negli ultimi 30 giorni"
SELECT date(timestamp) as day, AVG(duration_ms) 
FROM debate_entries 
WHERE author='alice' AND timestamp > date('now', '-30 days')
GROUP BY day;

-- ❌ VUOTO se il DB è stato creato ieri
```

L'utente non capisce perché i dati storici mancano.

**Fix Necessario:**
- **Minimo:** Warning esplicito in `alfred_init`:
  ```
  ⚠️  Migrazione a SQLite: i debate precedenti al 2026-05-21 non sono tracciati.
      Per importarli, esegui: alfred migrate --from-files
  ```
- **Ideale:** Script `alfred migrate --from-files` che:
  1. Legge tutti i `debate.json` + `thread.md` esistenti
  2. Parsa le entry (con regex)
  3. Popola il DB con `duration_ms=NULL`, `token_*=NULL` (dati mancanti)
  4. Marca i debate come `migrated=true` per distinguerli

---

## 📊 Matrice di Rischio

| Rischio | Probabilità | Impatto | Severity | Rilevato da Test |
|---------|-------------|---------|----------|------------------|
| Multi-process lock failure | Alta (CI, dev paralleli) | Alto (data loss) | 🔴 CRITICO | ✅ Confermato |
| FK constraint violation (author) | Certa (codice attuale) | Alto (INSERT fails) | 🔴 CRITICO | ✅ Confermato |
| team_members UNIQUE violation | Alta (ogni config change) | Alto (schema breaks) | 🔴 CRITICO | ⚠️ Inferito |
| Performance tracking incomplete | Media (se retry esiste) | Medio (dati parziali) | 🟡 ALTO | ⚠️ Inferito |
| FTS5 trigger failure | Bassa (solo OOM) | Medio (search broken) | 🟡 ALTO | ⚠️ Inferito |
| Migration ignorata | Certa (decisione design) | Medio (UX confusion) | 🟡 ALTO | N/A |

---

## ✅ Schema Corretto (Post-Analisi)

```sql
-- Teams (leggi da manifest.json, non duplicare)
-- ❌ ELIMINA team_members table

-- Debates
CREATE TABLE debates (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  flow TEXT NOT NULL,  -- JSON
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT,
  manifest_snapshot TEXT NOT NULL,  -- JSON del manifest.json al momento del debate
  UNIQUE(team_id, sequence)
);

-- Debate entries (append-only log)
CREATE TABLE debate_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id TEXT NOT NULL,
  author TEXT NOT NULL,  -- ← NESSUN FK, validazione a runtime
  timestamp TEXT NOT NULL,
  content TEXT,
  turn_order INTEGER NOT NULL,  -- ← per sorting affidabile, non timestamp
  FOREIGN KEY(debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  UNIQUE(debate_id, turn_order)
);

-- Turn attempts (per tracking retry/errors)
CREATE TABLE turn_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id TEXT NOT NULL,
  author TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  duration_ms INTEGER,
  token_input INTEGER,
  token_output INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  error_message TEXT,
  exit_code INTEGER,
  success BOOLEAN NOT NULL,
  FOREIGN KEY(debate_id) REFERENCES debates(id) ON DELETE CASCADE
);

-- Link successful attempt to debate entry
ALTER TABLE debate_entries ADD COLUMN successful_attempt_id INTEGER 
  REFERENCES turn_attempts(id);

-- FTS5 (popola DOPO commit principale per evitare inconsistenze)
CREATE VIRTUAL TABLE debate_fts USING fts5(
  debate_id UNINDEXED,
  author UNINDEXED,
  content,
  tokenize='porter'
);

-- Indices
CREATE INDEX idx_debate_entries_debate ON debate_entries(debate_id, turn_order);
CREATE INDEX idx_turn_attempts_debate ON turn_attempts(debate_id, author, started_at);
CREATE INDEX idx_debates_team_created ON debates(team_id, created_at DESC);
```

---

## 🎯 Checklist Pre-Implementation

- [ ] **Transazioni con Retry**: Implementa `withTransaction()` con exponential backoff
- [ ] **Schema senza FK su author**: Valida author in TypeScript, non in DB
- [ ] **manifest_snapshot in debates**: Salva JSON completo, elimina `team_members` table
- [ ] **turn_order invece di timestamp**: Per sorting affidabile in parallel steps
- [ ] **turn_attempts table**: Per tracking completo di retry/errors
- [ ] **FTS5 populate manuale**: Inserisci in `debate_fts` DOPO commit di `debate_entries`
- [ ] **Migration script**: Opzionale ma documentato, con warning esplicito
- [ ] **Test multi-process**: Verifica che withTransaction() gestisca lock correttamente
- [ ] **Error handling**: Ogni db.exec/prepare deve avere try-catch con rollback

---

## 🔥 Domande Rimanenti per l'Utente

1. **Retry Logic**: `runAgentTurn` attualmente fa retry? Se sì, quanti attempt?
2. **Concurrent Runs**: È scenario reale avere 2+ alfred_run in parallelo sullo stesso progetto?
3. **Migration**: Preferisci warning + script opzionale, o blocco hard fino a migration completata?
4. **Team Config Changes**: Quanto spesso il manifest.json cambia? Salvare snapshot è overkill?
5. **Performance Budget**: Acceptable latency per saveDebate: <10ms, <50ms, <100ms?

---

**Verdetto di Sostenibilità:** 🔴 **RISCHIOSO**

Le proposte precedenti hanno **3 bug critici certi** (multi-process lock, FK violation, team_members UNIQUE) e **2 rischi alti** (performance tracking, FTS5 consistency).

**L'unica cosa fondamentale da cambiare:**
- Implementare **transaction wrapper con retry** prima di qualsiasi altro codice
- Rivedere schema eliminando FK fragili e duplicazione

