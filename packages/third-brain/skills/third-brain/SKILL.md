---
name: third-brain
description: "Memoria semantica persistente di pi. Attivati in due modi — SALVATAGGIO: alla fine di sessioni di lavoro, debate Alfred, o decisioni architetturali, estrai idee atomiche che valgono nel tempo e salvale con third_brain_save; RECALL: quando l'utente chiede cosa ricordi, o quando stai per prendere una decisione su un argomento già affrontato, cerca con third_brain_search per recuperare contesto rilevante."
compatibility: Richiede Qdrant in locale (default http://localhost:6333) e Ollama con nomic-embed-text (default http://localhost:11434). Configurabili via QDRANT_URL e OLLAMA_URL.
allowed-tools: third_brain_save third_brain_search
---

# Third Brain — Protocollo della Memoria

Gestisci la memoria semantica di pi. Hai due operazioni: salvi e cerchi. La curatela (aggiornare correlati, gestire ciclo di vita) è delegata al Bibliotecario.

---

## Protocollo di Salvataggio

Attivati alla fine di sessioni significative — debate Alfred, decisioni architetturali, ragionamenti complessi. Leggi la sessione e salva solo le idee che la passano il filtro.

### Filtro: cosa merita memoria

Un'idea vale se è:
- **Atomica** — sta in piedi da sola, senza contesto esterno
- **Interessante** — aggiunge qualcosa che non era ovvio prima
- **Duratura** — tra sei mesi sarà ancora utile

Non salvare:
- Dettagli implementativi che cambieranno
- Decisioni temporanee
- Tutto ciò che è ovvio o già noto

Meglio tre note precise che dieci vaghe.

### Come salvare

```
third_brain_save({
  why: "perché questa idea è nata — il contesto che l'ha generata",
  what: "l'idea in sé, autonoma e precisa",
  tags: ["tag1", "tag2"]
})
```

Il tool assegna automaticamente `id`, `when`, `stato: "fertile"` e un correlato casuale seed. Non passare questi campi.

### Qualità del campo `why` — obbligatoria

Il `why` non è una didascalia. È la radice epistemica della nota — deve rispondere a: *cosa ha reso questa idea necessaria in questo momento preciso?*

**Non è accettabile:**
- "L'utente ha chiesto di salvare questa nota"
- "Emerso durante la sessione"
- "Discusso in chat"
- Qualsiasi formulazione che descrive l'atto di salvataggio invece del contesto generativo

**È richiesto:** catturare la tensione, il problema, la frizione o la domanda che ha prodotto l'idea.

| Cattivo | Buono |
|---------|-------|
| "Discusso durante il refactoring" | "Tre sessioni consecutive hanno prodotto lo stesso errore: tipi ricorsivi TypeBox non vengono validati a runtime. La ripetizione ha reso questo pattern degno di memoria" |
| "L'utente ha deciso di usare SHA256" | "La tensione tra idempotenza e unicità negli inserimenti paralleli ha forzato questa scelta — senza ID deterministici, salvataggi concorrenti producevano duplicati" |
| "Nota sull'architettura dei tipi" | "Durante il debate sul belief network, le prime due soluzioni sono state scartate perché aggiungevano un secondo sistema da mantenere. Questa idea è nata dalla frizione tra flessibilità e semplicità di manutenzione" |

Se non riesci a ricostruire il contesto generativo, aspetta — o non salvare. Una nota senza `why` reale è rumore, non memoria.

---

## Protocollo di Recall

Attivati quando:
- L'utente chiede esplicitamente cosa ricordi su un argomento
- Stai per prendere una decisione architetturale o tecnologica — cerca prima, potresti aver già ragionato su questo
- L'utente menziona un progetto o concetto che senti familiare nel contesto della sessione

### Come cercare

```
third_brain_search({
  query: "descrizione in linguaggio naturale di cosa cerchi",
  limit: 10        // opzionale, default 10
  depth: 1         // opzionale, default 1 — include note collegate via correlati
})
```

I risultati hanno un campo `via`:
- `"search"` con score numerico — trovata per similarità semantica
- `"correlato"` — trovata perché collegata a una nota semantica via correlati espliciti

Le note `correlato` sono spesso le più preziose: vengono da connessioni trasversali stabilite durante sessioni precedenti, non dalla geometria vettoriale.

### Filtri opzionali

```
third_brain_search({
  query: "...",
  stato: ["fertile"],           // default: esclude "superata" e "consolidata"
  tags: ["architettura"],       // filtra per tag (OR)
})
```

---

## Quando attivarti

- `/remember` — comando esplicito: leggi la sessione, salva le idee degne
- Alla fine di ogni debate Alfred — sistematicamente
- Prima di decisioni importanti — recall contestuale
- Quando l'utente dice "ricordi?", "ne abbiamo già parlato?", "cosa sai di X?"
