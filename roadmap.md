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
**Status:** 📅 Planned

### Core Objectives
Shift from "Save-at-End" to a "Write-per-Turn" model to ensure that every LLM contribution is persisted the millisecond it is generated. This creates a "flight recorder" for every debate.

### Key Deliverables
- [ ] **Immediate Write**: Refactor `flow-runner.ts` to call `db.insertTurn()` immediately after each agent output.
- [ ] **Timing Isolation**: Capture `duration_ms` using `performance.now()` *outside* the DB transaction to avoid I/O bias.
- [ ] **Parallel Snapshots**: Implement thread snapshotting before spawning parallel groups to ensure consistent context for all members.
- [ ] **Sync-to-Memory**: Maintain `debate.thread` in RAM as a volatile view, synchronized with the DB as the single source of truth.

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
**Status:** 🚀 In Progress

### Core Objectives
Implement a deterministic recovery mechanism to resume interrupted debates without losing progress or wasting tokens.

### Key Deliverables
- [ ] **Zombie Detection**: Identification of "interrupted" debates (records where `closed_at IS NULL`).
- [ ] **Replay Engine**: Implement `--resume <debate_id>` functionality.
- [ ] **Thread Reconstruction**: Logic to rebuild the in-memory state by replaying the `debate_entries` log.
- [ ] **Idempotent Restart**: Identify the exact failed `FlowStep` and resume execution from that point.

---

## 📊 Phase 4: Knowledge Engine & Analytics
**Status:** 📅 Planned

### Core Objectives
Leverage the structured data in SQLite to transform Alfred's logs into a searchable, analytical knowledge base.

### Key Deliverables
- [ ] **Semantic Search**: Advanced FTS5 queries to find patterns and conflicts across all project debates.
- [ ] **Performance Dashboard**: Generate reports on average duration, error rates, and "most reliable members".
- [ ] **Auto-Optimization**: Use performance metrics to suggest model swaps (e.g., upgrading a member to a larger model if error rates are too high).
- [ ] **On-Demand Export**: Generate Markdown threads and JSON summaries directly from DB queries.

---

## 📈 Definition of Done (DoD)
A phase is considered **Complete** only when:
1. Code is implemented and merged.
2. `pi-devs` (Cleaner/Verifier) have confirmed the absence of redundancies and regressions.
3. `pi-quality-guard` (Security/Perf/Judge) has issued a formal **APPROVATO** verdict.
