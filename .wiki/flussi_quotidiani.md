---
tags: [flussi, workflow, gtd, memoria]
sources: [alfred.md, skills/seneca/SKILL.md, skills/platone/SKILL.md, skills/annibale/SKILL.md]
updated: 2026-05-30
---

# Flussi Quotidiani

I pattern operativi ricorrenti del sistema.

## 1. Capture

Qualcosa da fare emerge durante una sessione:

```bash
td add "<cosa esatta>" --list inbox
```

Senza attrito, senza processare. Il processing si fa dopo.

## 2. Processing Inbox

```bash
td inbox
```

Per ogni task:
- Non actionable → `td move <id> someday` o `td done <id>`
- Azione < 2 min → falla + `td done <id>`
- Azione > 2 min → `td move <id> next`
- Multi-step → `td project add` + sposta in next come prima azione
- Aspetti qualcuno → `td move <id> waiting` + `--waiting-for`

## 3. Sessione di Lavoro

Hai X ore: `td next` + `td project list`. Considera urgenza (due), contesto, energia, priorità progetto. Proponi 2-3 task realisticamente chiudibili.

## 4. Sedimentazione della Conoscenza (Platone)

Fine sessione con output di valore:

1. Alfred segnala: "c'è materiale da sedimentare"
2. Platone: analizza thread → distilla concetti atomici → propone uno alla volta → aspetta conferma → salva
3. Dopo ogni save: `tb random` per connessioni serendipiche

## 5. Ricerca Prima di Rispondere (Oracolo / Alfred)

Prima di rispondere su un argomento che potrebbe essere nel TB:

```bash
tb search "<tema>" --depth 1
```

Se trovato: usa il materiale sedimentato, non reinventare.
Se vuoto: il vuoto è informazione — dichiaralo.

## 6. Orchestrazione Multi-Cappello (Annibale)

Problema complesso → Annibale scompone → propone flow → aspetta conferma → esegue.

Pattern sequenziale (default):
```bash
th run --member <nome1> --task "<task>" --output /tmp/step1.md
th run --member <nome2> --task "<task>\n\nContesto:\n$(cat /tmp/step1.md)" --output /tmp/step2.md
```

Il Blu chiude sempre il ciclo con sintesi e decisione.

## 7. Weekly Review (Seneca)

1. Svuota inbox
2. Rivedi next actions (ancora rilevanti?)
3. Rivedi progetti (ogni progetto ha una next action?)
4. Rivedi waiting (qualcosa sbloccato? da sollecitare?)
5. Rivedi someday (qualcosa diventato rilevante?)
6. Guarda avanti (cosa arriva la prossima settimana?)

## 8. Manutenzione Wiki (Omero)

- **Ingest**: nuovo materiale → `leggi → discuti → scrivi .wiki/ → aggiorna index + cross-ref + log`
- **Query**: domanda → `index → pagine rilevanti → risposta`
- **Lint**: health-check → contraddizioni, orfani, gap, affermazioni superate

## Riferimenti incrociati

- [Sistema Overview](sistema_overview.md)
- [Agenti e Skill](agenti_skill.md)
- [CLI Reference](cli_reference.md)
