# Pi

Sistema di augmentazione cognitiva personale. Tre layer ortogonali che cooperano senza sovrapporsi.

## I Tre Layer

| CLI | Nome | Scopo |
|-----|------|-------|
| `tb` | Third Brain | Memoria semantica: idee, concetti, connessioni. Grafo associativo immutabile. |
| `td` | Third Done | GTD: task, progetti, impegni. Cattura senza attrito, processa con metodo. |
| `th` | Third Hand | Orchestrazione agenti con cappelli de Bono. Flow sequenziali e paralleli. |

## Gli Agenti

| Agente | Ruolo |
|--------|-------|
| `annibale` | Orchestratore: scompone lavori complessi in flow multi-cappello |
| `platone` | Sedimenta idee nel TB in modo atomico e connesso |
| `feynman` | Insegna il corpus TB con la tecnica Feynman |
| `socrate` | Genera attrito cognitivo: trova contraddizioni e lacune, non chiude |
| `aristotele` | Cura le sintesi del TB: hub, connessioni mancanti, cluster |
| `oracolo` | Recupera conoscenza dal TB senza interpretare |
| `seneca` | GTD personale via `td` |
| `ermes` | Estrae testo da URL (articoli web e YouTube) |
| `indiana` | Archeologia del codice: diagnostica pattern e debiti tecnici |
| `prometeo` | Crea e migliora skill |
| `omero` | Mantiene la wiki locale del progetto in `.wiki/` |

## Setup

```bash
./setup.sh
```

Installa i symlink di `tb`, `td`, `th` in `~/.local/bin/`.

---

## Il Rituale

Il sistema funziona solo se usato con continuità. Tre momenti al giorno.

### Mattina — Seneca (5 min)

```bash
td inbox      # processa tutto ciò che è entrato
td next       # scegli 2-3 task reali per la giornata
```

Nient'altro. Non pianificare l'intera settimana — scegli cosa chiudi oggi.

### Durante il lavoro — Alfred + th

Prima di rispondere su un argomento che potrebbe essere nel TB:

```bash
tb search "<tema>" --depth 1
```

Per problemi complessi che beneficiano di prospettive multiple: Annibale orchestra.
Per estrarre contenuto da URL o video: Ermes.
Per catturare task che emergono durante il lavoro: `td add "<cosa>"` — senza processare.

### Fine sessione — Platone (10 min)

Se c'è stato output di valore (una decisione, un'idea, un pattern): Platone sedimenta nel TB.
Se il lavoro era su un progetto con wiki: Omero aggiorna `.wiki/`.

La regola: se non lo sedimenti adesso, non esiste domani.

### Settimanale — Seneca + Aristotele

**Seneca weekly review**: svuota inbox, rivedi next actions, verifica che ogni progetto abbia una next action, guarda la settimana che viene.

**Aristotele** (ogni 2-4 settimane): quando il TB inizia a sembrare denso, Aristotele crea hub e connette note isolate.

---

### La distinzione fondamentale

**Third Brain**: idee che valgono oltre il progetto — principi, pattern, tensioni cognitive. No blocchi di codice, no documentazione tecnica dettagliata.

**Wiki locale** (`.wiki/`): documentazione specifica del progetto — comandi, flussi, architettura, lore. Vive e muore con il progetto.

I due sistemi si complementano, non si sovrappongono.
