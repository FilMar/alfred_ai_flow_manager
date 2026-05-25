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

La CLI si chiama `th` (Third Hand), simmetrica a `tb`. I cappelli de Bono vivono in `tools/alfred/hats/`. I membri del progetto in `.th/members/`, i membri temporanei in `/tmp/.th/members/`.

### 2A — Membro ✅

- [x] **`th member create <name>`**: Crea un membro con `--hat`, `--role`, `--tools`, `--skills`. Persiste in `.th/members/<name>.md` come frontmatter + system prompt (ruolo + hat).
- [x] **`--tmp`**: Flag opzionale — salva il membro in `/tmp/.th/members/` invece del progetto. Utile per membri usa-e-getta.
- [x] **`th member list`**: Lista membri del progetto corrente.
- [x] **Risoluzione membro**: `getMember()` cerca prima in `.th/members/`, poi in `/tmp/.th/members/`.

### 2B — Esecuzione singola ✅

- [x] **`th run --member <name> --task "..."`**: Carica il membro, chiama `createAgentSession()` con system prompt override (ruolo + hat), tools e skills del membro. Streaming su stdout. `SessionManager.inMemory()`.

### 2C — Team

- [ ] **`th team create <name>`**: Definisce un team come lista ordinata di member id. Persiste in `.th/teams/<name>.json`.
- [ ] **`th team list`**: Lista team disponibili nel progetto.

### 2D — Esecuzione sequenziale

- [ ] **`th run --team <name> --task "..."`**: Carica il team, esegue i membri in sequenza. Ogni membro riceve il task + gli output dei membri precedenti. Stampa l'output complessivo al termine.

### 2E — Tracking SQLite

- [ ] **Layer dati**: SQLite via Bun. Schema: `runs`, `member_outputs`.
- [ ] **`th history`**: Lista run passati con runId, team, task, timestamp.
- [ ] **`th get <runId>`**: Output completo di un run — tutti i member output in ordine di esecuzione.

### 2F — Flow avanzati

- [ ] **Branch paralleli**: Membri in parallelo con `Promise.all()`, output mergiati prima del nodo successivo.
- [ ] **Roundtable**: Round-robin per N round tra un set di membri.
- [ ] **Conditional edges**: Routing dinamico basato su metriche o output.
- [ ] **Human-in-the-loop**: Pausa del flow per input CLI.

### 2G — Valutazione e evoluzione

- [ ] **Judge node**: Valuta gli output dei membri, produce punteggi, può pilotare routing condizionale.
- [ ] **`th scores`**: Report aggregato per cappello / team nel tempo.
- [ ] **`th evolve <runId>`**: Suggerisce diff ai system prompt dei cappelli underperforming.

---

## Phase 3: Integrazione Third Brain
**Status:** Pianificata

- [ ] **Briefing via Oracolo**: Prima di ogni run, `th run --brief` contestualizza il task interrogando `tb search`. L'output viene preposto al task per tutti i membri.
- [ ] **Preservazione via Platone**: A run completato, `th run --preserve` distilla l'output nel Third Brain via `tb save`.
- [ ] **Skill `th` aggiornata**: Aggiornare `skills/alfred/SKILL.md` per referenziare i comandi reali.

---
