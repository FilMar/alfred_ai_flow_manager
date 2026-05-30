# Flow: Debate dialettico

**Quando usarlo**: l'utente vuole esplorare un'idea, una tensione o una decisione attraverso un ciclo socratico che si sedimenta nel Third Brain.

**Natura**: interattivo — aspetta la risposta dell'utente tra le fasi. Non è un pipeline batch.

**Prerequisiti**: Qdrant e Ollama attivi (`tb status`). Se non lo sono, chiedi all'utente di avviarli con `tb start`.

---

## Il ciclo

```
[1. ORACOLO]    → recupera contesto sul tema dal TB
[2. SOCRATE]    → trova la tensione, fa la domanda scomoda
[3. UTENTE]     → risponde, riflette, spinge
[4. ARISTOTELE] → integra nel Third Brain ciò che è nuovo
[5. ORACOLO]    → verifica le connessioni aggiornate
→ torna a [2] oppure chiudi
```

---

## Fase 1 — Oracolo: contesto

```bash
th run --member oracolo --task "Recupera tutto ciò che il Third Brain sa su: <tema>"
```

Presenta il risultato. Se il TB è vuoto sull'argomento, dillo — il vuoto è informazione.

## Fase 2 — Socrate: tensione

```bash
th run --member socrate --task "Tema: <tema>

Contesto dal Third Brain:
<output fase 1>

Risposta utente precedente (se esiste):
<risposta utente>

Trova la tensione più scomoda e fai una sola domanda."
```

Presenta la domanda. Aspetta. Non interrompere.

## Fase 3 — Utente

Quando l'utente ha finito, vai alla fase 4.

## Fase 4 — Aristotele: integra

```bash
th run --member aristotele --task "Tema: <tema>

Domanda di Socrate:
<domanda fase 2>

Risposta dell'utente:
<risposta utente>

Integra nel Third Brain ciò che è nuovo. Se non c'è nulla di nuovo, dillo."
```

## Fase 5 — Oracolo: reverifica

```bash
th run --member oracolo --task "Reverifica il grafo del Third Brain su: <tema> — mostra cosa è cambiato rispetto all'inizio del ciclo."
```

Poi chiedi: **Vuoi continuare il ciclo su questa tensione, o portare un'idea diversa?**

---

## Regole

- Non fare il lavoro degli agenti: non cercare nel TB tu stesso, non generare tensioni, non salvare note. Delega sempre via `th run`.
- Trasmetti contesto esplicito: ogni `th run` deve ricevere nel `--task` tutto ciò che l'agente non può sapere da solo.
- Il ciclo termina quando l'utente lo dice.
