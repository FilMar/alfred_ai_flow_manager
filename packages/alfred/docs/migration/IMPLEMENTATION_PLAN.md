# Implementation Plan: File → SQLite Migration

**Status:** BLOCKED — awaiting user decisions  
**Risk Level:** 🔴 HIGH (3 critical bugs identified)  
**Estimated Effort:** 3-4 days (with testing)

---

## 🚦 Blocking Questions (User Decision Required)

### 1. Retry Logic in runAgentTurn

**Question:** Does `runAgentTurn` currently implement retry on failures (e.g., 429 rate limits, transient errors)?

**Impact:**
- ✅ **Yes** → We MUST implement `turn_attempts` table to track all attempts
- ❌ **No** → We can simplify schema (1 attempt = 1 entry, no separate attempts table)

**Current State:** Unknown (need to inspect `runAgentTurn` implementation)

---

### 2. Concurrent alfred_run Scenarios

**Question:** Is it realistic for 2+ `alfred_run` to execute simultaneously on the same project?

**Scenarios:**
- Dev runs `alfred_run` while CI pipeline also runs it
- Multiple developers on shared project (rare, but possible)
- Parallel testing (multiple teams, same DB)

**Impact:**
- ✅ **Yes** → Transaction retry logic is MANDATORY
- ❌ **No** → Can use simpler single-transaction approach

**Recommendation:** Assume YES (better safe than sorry, cost is low)

---

### 3. Migration Strategy

**Question:** How to handle existing debate files?

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Ignore legacy** | Simple, no migration code | User loses historical data, no "performance over time" |
| **B. One-shot migration script** | Preserves history, full dataset | Complex parser, missing perf data (duration/tokens unknown) |
| **C. Lazy migration (on-read)** | Gradual, user-triggered | Mixed storage model, confusing UX |

**Recommendation:** **Option B** with clear warning:
```
⚠️  Debate files detected. Run migration:
    alfred migrate --from-files
    
    Note: Historical debates will have NULL performance data.
```

**Decision Required:** A, B, or C?

---

### 4. team_members Duplication

**Question:** How often does `manifest.json` change for a team?

**Context:**
- If rarely (e.g., once per month): Store full snapshot in `debates.manifest_snapshot`
- If frequently (e.g., daily model tuning): Snapshot creates massive duplication

**Impact:**
- **Rarely** → Full snapshot is fine (10KB × 100 debates = 1MB, acceptable)
- **Frequently** → Need audit log approach (track changes, not snapshots)

**Recommendation:** Start with full snapshot, add audit log if duplication becomes problem.

---

### 5. Performance Budget

**Question:** What is acceptable latency for `saveDebate`?

**Context:**
- Current file-based approach: ~5ms (write 3 files)
- SQLite approach: ~10-20ms (transaction + FTS)
- With concurrent retry: up to 200ms (if 5 retries with backoff)

**Thresholds:**
- `< 10ms` → May need optimization (batch inserts, skip FTS)
- `< 50ms` → Acceptable for dev workflow
- `< 100ms` → Fine for CI/automation

**Decision Required:** What is the maximum acceptable delay?

---

## 📋 Implementation Phases

### Phase 0: Validation (1 day)

**Goal:** Confirm assumptions, answer blocking questions

- [ ] Inspect `runAgentTurn` for retry logic
- [ ] Measure current `saveDebate` latency (baseline)
- [ ] Count existing debate files (scope of migration)
- [ ] Check if concurrent runs happen in practice (git log, CI logs)

**Deliverable:** Updated plan with all questions answered

---

### Phase 1: Database Layer (1 day)

**Goal:** Create `db.ts` with transaction wrapper

**Tasks:**
- [ ] Create `packages/alfred/src/db.ts` (use `db-implementation.ts` as template)
- [ ] Copy `schema.sql` to `packages/alfred/schema/` (embedded in build)
- [ ] Implement `withTransaction()` with retry logic
- [ ] Add tests for concurrent access (multi-process test from CRITICAL_ANALYSIS)
- [ ] Add `getDB()` lazy initialization

**Acceptance Criteria:**
- ✅ `withTransaction()` handles lock errors with retry
- ✅ Multi-process test passes (both processes write successfully)
- ✅ Schema initialization creates all tables + indices

---

### Phase 2: Debate Persistence (1 day)

**Goal:** Replace `fs.ts:saveDebate` with `db.ts:saveDebateToDB`

**Tasks:**
- [ ] Implement `saveDebateToDB()` in `db.ts`
- [ ] Add `manifest_snapshot` capture in `index.ts:alfred_run`
- [ ] Update `index.ts` to call `saveDebateToDB` instead of `saveDebate`
- [ ] Preserve `formatThread()` for synthesis (still needed for LLM context)
- [ ] Remove `thread.md`, `summary.md` writes from `fs.ts:saveDebate`
- [ ] Keep `debate.json` write for now (backward compat)

**Breaking Change:**
- `loadDebate()` no longer reads from files (only from DB)
- Old debate files remain but are NOT loaded automatically

**Acceptance Criteria:**
- ✅ New debates save to DB correctly
- ✅ `debate.thread` persists with correct `turn_order`
- ✅ FTS5 populated (test with full-text search)

---

### Phase 3: Performance Tracking (0.5 days)

**Goal:** Add `turn_attempts` tracking

**Tasks:**
- [ ] Wrap `runMember()` in `flow-runner.ts` with timing logic
- [ ] Call `recordTurnAttempt()` after each agent turn
- [ ] Link successful attempt to `debate_entries` via `successful_attempt_id`
- [ ] Add query helpers: `getDebateStats()`, `getMemberPerformance()`

**Acceptance Criteria:**
- ✅ Each turn has duration, token counts recorded
- ✅ Errors are logged in `turn_attempts.error_message`
- ✅ Query "average turn duration by member" returns valid data

---

### Phase 4: Migration Script (0.5 days)

**Goal:** Import legacy debate files

**Tasks:**
- [ ] Create `packages/alfred/src/migrate.ts`
- [ ] Parse `debate.json` + `thread.md` for each existing debate
- [ ] Insert into DB with `duration_ms=NULL`, `token_*=NULL`
- [ ] Add CLI command: `alfred migrate --from-files`
- [ ] Show warning in `alfred_init` if old files detected

**Acceptance Criteria:**
- ✅ All legacy debates visible in DB queries
- ✅ Legacy debates marked (e.g., `debates.migrated=true` flag)
- ✅ User warned about missing performance data

---

### Phase 5: Cleanup (0.5 days)

**Goal:** Remove dead code, update docs

**Tasks:**
- [ ] Delete `thread.md` / `summary.md` write code from `fs.ts`
- [ ] Mark `debate.json` as "deprecated, for compat only"
- [ ] Update README with SQLite migration notes
- [ ] Add `docs/migration/` link to main docs
- [ ] Remove `loadDebate()` file-based logic (DB-only)

**Acceptance Criteria:**
- ✅ No code writes `thread.md` or `summary.md`
- ✅ Users know `debate.json` is legacy format

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// db.test.ts
describe('withTransaction', () => {
  test('retries on lock error', async () => {
    const db1 = getDB('/tmp/test1');
    const db2 = getDB('/tmp/test1');
    
    // Simulate concurrent writes
    const p1 = withTransaction(db1, () => {
      db1.exec('INSERT INTO debates ...');
      sleep(100); // Hold lock
    });
    
    const p2 = withTransaction(db2, () => {
      db2.exec('INSERT INTO debates ...');
    });
    
    await Promise.all([p1, p2]);
    // Both should succeed (retry logic)
  });
});
```

### Integration Tests

```typescript
// index.test.ts
describe('alfred_run with DB', () => {
  test('saves debate to SQLite', async () => {
    await alfred_run({ projectRoot: '/tmp/test', team: 'test', task: 'hello' });
    
    const db = getDB('/tmp/test');
    const debates = db.prepare('SELECT * FROM debates').all();
    expect(debates).toHaveLength(1);
    expect(debates[0].team_id).toBe('test');
  });
  
  test('concurrent runs do not corrupt data', async () => {
    await Promise.all([
      alfred_run({ projectRoot: '/tmp/test', team: 'test', task: 'task1' }),
      alfred_run({ projectRoot: '/tmp/test', team: 'test', task: 'task2' })
    ]);
    
    const db = getDB('/tmp/test');
    const debates = db.prepare('SELECT * FROM debates').all();
    expect(debates).toHaveLength(2);
  });
});
```

### Performance Tests

```typescript
test('saveDebateToDB completes within 50ms', async () => {
  const debate = createMockDebate(20); // 20 contributions
  const db = getDB(':memory:');
  
  const start = Date.now();
  saveDebateToDB(db, debate, { team, turnOrder: [0,1,2,...] });
  const elapsed = Date.now() - start;
  
  expect(elapsed).toBeLessThan(50);
});
```

---

## 🚨 Rollback Plan

If SQLite migration causes production issues:

1. **Revert to file-based storage:**
   ```bash
   git revert <migration-commit>
   npm run build
   ```

2. **Data preservation:**
   - SQLite DB remains at `.alfred/alfred.db` (not deleted)
   - Old debate files still exist (never deleted by migration)
   - User can export DB to files: `alfred export --db-to-files`

3. **Hybrid mode (emergency):**
   - Keep `saveDebate()` writing files
   - Add `saveDebateToDB()` in parallel
   - User can choose via env var: `ALFRED_STORAGE=file|db`

---

## 📊 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Data Integrity** | 0 debate losses | Count debates in DB vs files |
| **Performance** | < 50ms saveDebate | Benchmark in CI |
| **Concurrency** | 100% success rate | Multi-process stress test (10 parallel runs) |
| **Migration** | 100% legacy debates imported | Compare file count vs DB rows |
| **Search** | FTS5 returns results | Query "authentication" across debates |

---

## 🔥 Next Steps

**FOR USER:**
1. Answer 5 blocking questions above
2. Confirm implementation phases are acceptable
3. Approve schema (`schema.sql`) and API (`db-implementation.ts`)

**FOR DEVELOPER:**
1. Wait for user decisions
2. Start Phase 0 (validation)
3. Proceed with Phase 1-5 sequentially

**Estimated Timeline:** 3-4 days (assuming no major blockers)

---

**Related Documents:**
- `CRITICAL_ANALYSIS.md` — Risk analysis and failure scenarios
- `schema.sql` — Database schema
- `db-implementation.ts` — Implementation template
