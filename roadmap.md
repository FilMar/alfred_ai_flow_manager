# 🚀 Alfred: Roadmap to Production-Grade Persistence

This roadmap describes the evolution of Alfred from a file-based prototype to an industrial-grade agent orchestration system using a **Hybrid Event-Log Persistence** model.

## 🏁 Architecture Goal
Transform Alfred into an **anti-fragile** system where no data is lost during crashes, turns are persisted in real-time, and the project state is managed via atomic operations and a high-performance SQLite engine.

---

## 🛠 Phase 1: Anti-Fragile Infrastructure (Foundation)
**Status:** ✅ Completed

### Core Objectives
- Replace procedural helpers with a robust OOP abstraction layer.
- Ensure project-level isolation and atomic configuration management.
- Implement a high-performance, lock-resistant database core.

### Key Deliverables
- [x] **OOP Layer**: `AlfredProject`, `AlfredStorage`, and `AlfredDatabase` classes.
- [x] **Atomic JSON**: Write-to-temp-then-rename pattern for all `.json` files.
- [x] **SQLite Hardening**: WAL Mode and `synchronous = NORMAL` activation.
- [x] **Multi-Project Support**: DB instance mapping per `projectRoot`.
- [x] **Corrective Fixes**:
    - [x] **Atomic Sequence**: Sequence assigned via atomic SQL subquery to prevent race conditions.
    - [x] **Thread Integrity**: Prevent duplication in `saveDebate` via `DELETE` before `INSERT`.
    - [x] **Pure Type-Safety**: Removed all `as any` casts; implemented `DebateRow` and `DebateEntryRow` interfaces.
    - [x] **Atomic FTS**: Replaced manual indexing with SQL Triggers (`AFTER INSERT`/`AFTER DELETE`).

---

## ⚡ Phase 2A: The Safety Net (Immediate Persistence)
**Status:** ✅ Completed

### Core Objectives
Shift from "Save-at-End" to a "Write-per-Turn" model to ensure that every LLM contribution is persisted the millisecond it is generated. This creates a "flight recorder" for every debate.

### Key Deliverables
- [x] **Immediate Write**: Refactor `flow-runner.ts` to call `db.insertTurn()` immediately after each agent output.
- [x] **Timing Isolation**: Capture `duration_ms` using `performance.now()` *outside* the DB transaction to avoid I/O bias.
- [x] **Parallel Snapshots**: Implement thread snapshotting before spawning parallel groups to ensure consistent context for all members.
- [x] **Sync-to-Memory**: Maintain `debate.thread` in RAM as a volatile view, synchronized with the DB as the single source of truth.

## ⚡ Phase 2B: The Freedom Engine (Async Execution)
**Status:** ✅ Completed

### Core Objectives
Decouple execution from the main process. Alfred becomes a background service that can be monitored and queried in real-time without blocking the user.

### Key Deliverables
- [ ] **Asynchronous Orchestration (Detached Mode)**: 
    - Implement a worker-based execution model where `alfred_run` kicks off the flow in a background process.
    - Transition from "Request-Wait-Response" to "Fire-and-Forget $\to$ Immediate ACK".
- [ ] **Live Status Tracking**: 
    - Add `status` column to `debates` table (`running`, `completed`, `failed`, `paused`).
    - Create `alfred_status` tool to poll current progress and last active member.

---

## ♻️ Phase 3: The Resurrection Protocol (Recovery)
**Status:** ✅ Completed

### Core Objectives
Implement a deterministic recovery mechanism to resume interrupted debates without losing progress or wasting tokens.

### Key Deliverables
- [x] **Zombie Detection**: Identification of "interrupted" debates (records where `closed_at IS NULL`).
- [x] **Replay Engine**: Implement `alfred_resume` tool with zombie killer and concurrency guard.
- [x] **Thread Reconstruction**: Logic to rebuild the in-memory state by replaying the `debate_entries` log.
- [x] **Idempotent Restart**: Identify the exact failed `FlowStep` via `getCompletedFlowSteps()` and resume from that point.

---

## 📊 Phase 4: Knowledge Engine & Analytics
**Status:** ✅ Completed

### Core Objectives
Leverage the structured data in SQLite to transform Alfred's logs into a searchable, analytical knowledge base.

### Key Deliverables
- [x] **Semantic Search**: FTS5 full-text search via `db.searchDebates()`.
- [x] **Performance Dashboard**: `reporting.ts` genera report per-debate e per-member (duration, error rates, avg stats).
- [ ] **Auto-Optimization**: Use performance metrics to suggest model swaps (e.g., upgrading a member to a larger model if error rates are too high).
- [x] **On-Demand Export**: Generate Markdown threads and JSON summaries directly from DB queries.

---

## 🧩 Phase 5: Advanced Member Features & Knowledge Pipeline
**Status:** 📅 Planned

### Core Objectives
Estendere le capacità dei singoli membri del team con controllo granulare su skill e tool budget, e introdurre la pipeline cognitiva a quattro agenti (Alfredo → Platone → Socrate → Aristotele).

### 5A — Infrastruttura member

- [ ] **Skills resolver**: Resolver da nome skill a path file; passare via `--skill <path>` al subprocess pi. Il campo `skills?: string[]` in `TeamMember` è già definito in `types.ts`.
- [ ] **`maxToolCalls` enforcement**: Iniettare il cap come istruzione nel system prompt del subprocess ("You may use at most N tool calls in this turn."). Il campo `maxToolCalls?: number` in `TeamMember` è già definito in `types.ts`.

### 5B — Agenti della pipeline cognitiva

- [ ] **Oracolo (Retrieval dal Third Brain)**: Skill read-only di ricerca nel Third Brain. Un membro del team può invocarla durante il suo turno per recuperare materiale rilevante già elaborato — pattern riconosciuti, decisioni passate, concetti collegati. Porta conoscenza accumulata dentro al debate invece di ricominciare da zero. Nessuna scrittura, nessuna sintesi: solo retrieval.



- [ ] **Alfredo (Regista Operativo)**: Skill di orchestrazione pura. Riceve la richiesta, classifica il tipo di lavoro, costruisce il team specialisti (Hat + Skill), coordina l'esecuzione e sintetizza il risultato. A chiusura task innesca automaticamente Platone. Può consultare `awesome-claude-skills` per individuare skill utili da proporre per un team member.

- [ ] **Platone (Accrescitore della Memoria)**: Skill di estrazione valore post-task. Distingue tra conoscenza operativa (salva tutto nel Third Brain come materiale riusabile dall'AI) e conoscenza selettiva (filtra 1-2 concetti fertili/controintuitivi e li presenta in `ideas.md` come semi per la riflessione). Regole: atomicità, riusabilità, non banalità, focus sul "perché dell'idea" non sul contesto operativo.

- [ ] **Socrate (Provocatore — Elenchos)**: Skill di attrito cognitivo. Prende un'idea in input, interroga il Third Brain cercando contraddizioni e lacune, formula la domanda scomoda senza mai chiudere il ragionamento al posto dell'utente. L'obiettivo è creare tensione che non possa essere risolta digitalmente ma richieda la consultazione dell'Antinet.

- [ ] **Aristotele (Curatore della Sintesi)**: Skill di codifica della conoscenza elaborata. Prende la risposta dell'utente post-Antinet, promuove il materiale da "operativo/grezzo" a conoscenza personale elaborata, aggiorna i collegamenti, risolve le tensioni, genera nuove note hub per cluster concettuali densi.

### 5C — Flussi operativi

- [ ] **Flusso Diurno**: `Utente → Alfredo → [Team Specialisti] → Soluzione → Platone → Third Brain (+ seeds per l'utente)`

- [ ] **Flusso Serale (loop)**: `Utente propone idea → Socrate interroga DB → domanda scomoda → Utente su Antinet → Aristotele integra risposta nel DB → Socrate verifica tensione → (ripeti)`

---

## 📈 Definition of Done (DoD)
A phase is considered **Complete** only when:
1. Code is implemented and merged.
2. `pi-devs` (Cleaner/Verifier) have confirmed the absence of redundancies and regressions.
3. `pi-quality-guard` (Security/Perf/Judge) has issued a formal **APPROVATO** verdict.
