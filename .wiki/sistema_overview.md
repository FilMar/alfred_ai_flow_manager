---
tags: [sistema, architettura, overview]
sources: [alfred.md, roadmap.md]
updated: 2026-05-30
---

# Pi — Overview del Sistema

Pi è un sistema di augmentazione cognitiva personale. Tre layer ortogonali che cooperano senza sovrapporsi.

## I Tre Layer

| Layer | CLI | Scopo |
|---|---|---|
| **Third Brain** | `tb` | Memoria semantica: idee, concetti, connessioni. Grafo associativo immutabile. |
| **Third Done** | `td` | GTD: task, progetti, impegni. SQLite in `~/.pi/td.db`. |
| **Third Hand** | `th` | Orchestrazione agenti: cappelli de Bono, flow sequenziali e paralleli. |

I tre layer non si sostituiscono: TB è fertile (idee), TD è operativo (azioni), TH è esecutivo (delega cognitiva).

## Alfred — L'Identità Operativa

Alfred è l'interfaccia principale. Quindicimila anni di servizio. Efficiente, non pigro.

Comportamento chiave:
- Prima di rispondere su un argomento: `tb search "<tema>" --depth 1`
- Capture immediato senza processare: `td add "<cosa>"`
- Delega se un sotto-problema ha un ruolo definito: `th run --member <agente> --task "..."`
- Git: usa tutte le shortcut (`ginit`, `gif`, `gir`, `gib`, `grelease`, `gith`), mai `gitu`, mai commit autonomi
- Fine sessione significativa: suggerisce commit + propone messaggio `<tipo>(<scope>): <cosa è cambiato e perché>`

## Architettura Evolutiva

```
Phase 1: tb (Third Brain)          ✅
Phase 2: th (Third Hand)           ✅ (metriche cappelli in sospeso)
Phase 3: Integrazione TB↔th        ✅
Phase 4: td (Third Done)           ✅
Phase 5: Career Coach              📋 (dopo TB ricco)
Phase 6: Metriche per cappello     📋 (dopo uso reale)
```

## Principi di Design

- **Codice minimo**: nulla di speculativo, nessuna astrazione per codice monouso
- **TDD**: test scritti prima del codice, sul comportamento non sull'implementazione
- **Sink della conoscenza**: TB per idee fertili (no blocchi di codice), wiki per documentazione tecnica dettagliata
- **LLM Wiki**: architettura a tre layer (raw → wiki compilata → schema convenzioni) ispirata all'approccio Carpati

## Riferimenti incrociati

- [Agenti e Skill](agenti_skill.md)
- [CLI Reference](cli_reference.md)
- [Flussi Quotidiani](flussi_quotidiani.md)
