---
tags: [cli, tb, td, th, reference]
sources: [roadmap.md, skills/seneca/SKILL.md, skills/oracolo/SKILL.md]
updated: 2026-05-30
---

# CLI Reference

## tb — Third Brain

Memoria semantica. DB globale in `~/.pi/tb.db`.

```bash
# Ricerca
tb search "<query>" [--limit <n>] [--depth <n>] [--hybrid] [--tags <tag>] [--kind <kind>] [--evidence-only] [--include-hubs]
tb browse [--kind <kind>] [--since <ISO date>] [--limit <n>]
tb random                    # nota casuale
tb tags                      # lista tag per frequenza

# Scrittura
tb save --what "<idea>" --why "<ragione>" --kind <tipo> [--tags "tag1,tag2"] [--source <uri>]
tb update <id> [--add-ref "<id>:<ragione>"] [--kind <tipo>]

# Visualizzazione
tb graph                     # grafo interattivo nel browser (PCA 2D)
```

**Formati output:**
- `tb search` → `{ note, score, via, citation }` — i campi della nota sono sotto `.note`
- `tb browse` / `tb random` → note flat: `{ id, what, why, tags, kind, refs, backrefs, when }`
- `tb tags` → `{ value, count }[]`

**Flags ricerca:**
- `--depth 1/2`: espande ai concetti collegati via refs
- `--hybrid`: migliore su termini tecnici e nomi propri
- `--evidence-only`: solo fatti (`dato`)
- `--include-hubs`: include nodi `indice` (nascosti di default)

**Kind validi:** `dato`, `protocollo`, `sintesi`, `attrito`, `configurazione`, `indice`

---

## td — Third Done

GTD. DB globale in `~/.pi/td.db`.

```bash
# Task
td add "<cosa>" [--list <lista>] [--project <nome>] [--context <ctx>] [--due <YYYY-MM-DD>] [--waiting-for <chi>] [--notes <testo>]
td inbox
td next [--project <nome>]
td waiting
td someday
td list [--project <nome>]
td move <id> <lista>
td done <id>
td get <id>
td edit <id>                  # patch post-creazione di what, context, due, notes, waiting-for
td search <query> [--all]     # ricerca keyword sul JSON

# Progetti
td project add <nome> [--goal <testo>] [--goal-end <YYYY-MM-DD>]
td project list [--all]
td project done <id-o-nome>
```

**Liste:** `inbox` · `next` · `waiting` · `someday` · `project`

**Gli id si usano abbreviati (primi 8 caratteri).**

---

## th — Third Hand

Orchestrazione agenti. DB in `~/.pi/th.db` (runs + tracking).

```bash
# Membri
th member create <nome> --hat <cappello> --role "<ruolo>" --tools <t1,t2> [--skills <s1,s2>] [--tmp]
th member list [--all]
th member get <nome>
th member delete <nome>

# Esecuzione
th run --member <nome> --task "<prompt>" \
  [--thinking <off|minimal|low|medium|high|xhigh>] \
  [--model <provider/id>] \
  [--output <file>] \
  [--timeout <secondi>] \
  [--detach]

# Cappelli
th hats list
th hats get <nome>

# Storico
th history [--member <nome>] [--limit <n>]
th get <runId>

# Modelli
th models
```

**Sandbox bwrap:** ogni `th run` è isolato in un container read-only (tranne `cwd`, `~/.pi`, `/tmp`).

**`--detach`:** ritorna subito `{ pid, out, log, status }`. Il processo figlio scrive status (`running` → `done`/`error`) su file in `/tmp`.

---

## Git Shortcuts (Alfred)

```bash
ginit      # init + develop branch
gif        # feature branch
gir        # release branch
gib        # bugfix branch
grelease   # release flow
gith       # log graph
# gitu — VIETATO (add+commit+push automatico)
```

Formato commit (solo su richiesta esplicita): `<tipo>(<scope>): <cosa è cambiato e perché>`

## Riferimenti incrociati

- [Sistema Overview](sistema_overview.md)
- [Agenti e Skill](agenti_skill.md)
- [Flussi Quotidiani](flussi_quotidiani.md)
