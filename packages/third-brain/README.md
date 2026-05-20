# Third Brain (`pi-third-brain`)

Third Brain è un'estensione per [pi](https://github.com/badlogic/pi-mono) che aggiunge una memoria persistente e semantica all'assistente. Non è un archivio per l'utente: è il substrato di memoria di pi — un database vettoriale locale che cresce con ogni sessione e che pi interroga autonomamente per ragionare su ciò che sa già.

L'obiettivo è che pi ricordi. Non come un log di conversazioni, ma come una rete di pensieri connessi che si consolida nel tempo.

---

## Come funziona

Third Brain si basa su uno stack completamente locale:

- **Qdrant** — database vettoriale open-source, eseguito in locale.
- **Ollama + `nomic-embed-text`** — embedding engine locale (274MB, finestra di 8192 token, ottimo per testo misto italiano/inglese).

Ogni idea atomica viene salvata come punto vettoriale in Qdrant. Il vettore viene generato dal testo `why + what` — il contesto e il contenuto, non i metadati. I metadati (stato, tag, correlati) restano nel payload come filtri, non inquinano lo spazio semantico.

Quando pi cerca un'informazione, interroga Qdrant con similarità vettoriale e filtri sul payload. Il risultato non è un file di testo: è un insieme di ricordi classificati per rilevanza.

---

## Schema del Dato

Ogni ricordo è un punto vettoriale con questo payload:

```json
{
  "id": "string (SHA256 di what + when)",
  "when": "datetime (ISO 8601, timestamp di creazione)",
  "why": "string (contesto — perché questa nota è nata)",
  "what": "string (contenuto — l'idea atomica)",
  "tags": ["array di stringhe"],
  "stato": "fertile | superata | consolidata",
  "correlati": [
    {
      "id": "string (ID della nota collegata)",
      "perche": "string (ragione esplicita del collegamento)"
    }
  ]
}
```

### Regole di immutabilità

Il contenuto di una nota è **immutabile** dopo la creazione. Non si corregge un ricordo — si crea un nuovo ricordo che lo sostituisce e si aggiorna lo `stato` del precedente.

I soli campi modificabili dopo la creazione sono:

| Campo | Motivo |
|-------|--------|
| `stato` | Il ciclo di vita di un'idea cambia nel tempo |
| `correlati` | Le connessioni emergono dalla conversazione, non dal salvataggio |

---

## Ciclo di Vita delle Note

Nessun dato viene mai eliminato. Lo `stato` gestisce la visibilità nelle query ordinarie.

| Stato | Significato | Comportamento nelle query |
|-------|-------------|---------------------------|
| `fertile` | Idea attiva, in sviluppo | Inclusa nelle ricerche standard |
| `superata` | Sostituita da un pensiero più recente | Esclusa dalle ricerche standard, disponibile per analisi retrospettive |
| `consolidata` | Assorbita in una Nota Hub | Esclusa dalle ricerche standard, referenziata dalla Hub |

---

## I Correlati

Ogni nota nasce con **un correlato casuale** — un collegamento a una nota esistente scelta senza criterio semantico. Questo seed garantisce che ogni nuovo ricordo sia connesso alla rete esistente fin dall'inizio, anche quando la connessione logica non è ancora evidente.

I correlati significativi emergono **durante la conversazione**: quando pi riconosce una connessione tra due note, aggiorna il campo `correlati` con la ragione esplicita del collegamento.

Questo produce nel tempo un grafo di pensieri che va oltre la pura distanza vettoriale: due note possono essere semanticamente distanti (es. architettura software e psicologia cognitiva) ma connesse da un nesso esplicito stabilito durante una sessione di lavoro.

---

## API

### `third_brain_save`

Salva un'idea atomica. Genera l'embedding da `why + what`, assegna un ID deterministico (`SHA256(what + when)`), crea un correlato casuale dalla collezione esistente.

```
when   → timestamp automatico
why    → contesto della nota
what   → contenuto dell'idea
tags   → array di stringhe (opzionale)
stato  → default "fertile"
```

### `third_brain_search`

Ricerca semantica nella memoria. Accetta una query in linguaggio naturale, la converte in vettore con `nomic-embed-text`, interroga Qdrant con filtri opzionali su `stato` e `tags`.

Per default esclude le note con stato `superata` e `consolidata`.

### `third_brain_update`

Aggiorna `stato` o `correlati` di una nota esistente. Nessun altro campo è modificabile.

```
id        → ID della nota da aggiornare
stato     → (opzionale) nuovo stato
correlati → (opzionale) lista completa dei correlati da sovrascrivere
```

---

## Consolidamento (Nota Hub)

Per evitare la frammentazione della memoria quando le note sullo stesso argomento proliferano, il sistema supporta un ciclo di consolidamento:

1. **Analisi di densità** — HDBSCAN individua cluster di note semanticamente vicine senza richiedere il numero di cluster come parametro.
2. **Astrazione** — pi sintetizza le note del cluster in una nuova **Nota Hub** che ne cattura l'essenza.
3. **Archiviazione** — le note sorgente passano a stato `consolidata` e acquisiscono un correlato che punta alla Hub.

Le ricerche ordinarie interrogano prima le Hub per una visione d'insieme, scendendo nei dettagli delle note correlate solo se necessario.

---

## Configurazione

Due variabili d'ambiente, entrambe opzionali. I default coprono l'installazione locale standard.

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `QDRANT_URL` | `http://localhost:6333` | URL del server Qdrant |
| `OLLAMA_URL` | `http://localhost:11434` | URL del server Ollama |

```bash
# Esempio: Qdrant su porta non standard
export QDRANT_URL=http://localhost:6334

# Esempio: Ollama su host remoto
export OLLAMA_URL=http://192.168.1.10:11434
```

All'avvio, l'estensione verifica che entrambi i servizi siano raggiungibili e che `nomic-embed-text` sia presente in Ollama. Se qualcosa manca, stampa un warning con il comando esatto per risolvere.

---

## Prerequisiti

```bash
# Qdrant in locale (Docker)
docker run -p 6333:6333 qdrant/qdrant

# nomic-embed-text via Ollama
ollama pull nomic-embed-text
```

---

## Installazione

```bash
# Da repository git
pi install git:https://github.com/filmar/third-brain-pi

# Sviluppo locale (dalla root del repo)
pi install .
```

---

## Roadmap

- [x] Schema dati — payload JSON con immutabilità selettiva (`stato` e `correlati` mutabili)
- [x] Scelta stack — Qdrant + Ollama `nomic-embed-text` (locale, sovrano, nessuna dipendenza cloud)
- [x] Strategia embedding — `why + what` come testo embeddato, metadati come filtri payload
- [x] ID deterministici — `SHA256(what + when)`, evita duplicati, supporta re-vettorizzazione
- [x] Correlati lazy — 1 casuale alla creazione, significativi emergono dalla conversazione
- [x] Consolidamento — HDBSCAN invece di K-Means (nessun parametro K, cluster organici)
- [x] Skill `/remember` — estrae idee atomiche dalla sessione corrente e le salva
- [x] Tool `third_brain_save` — salvataggio con embedding + correlato casuale
- [x] Tool `third_brain_search` — ricerca semantica con filtri su stato e tags
- [x] Tool `third_brain_update` — modifica stato e correlati
- [x] Indici Qdrant — keyword su `stato`, `tags` per lookup O(1) nei salti di grafo
- [x] Healthcheck all'avvio — warning con comandi esatti se Qdrant o Ollama mancano
- [ ] Consolidamento automatico — ciclo HDBSCAN + sintesi Hub su richiesta
