# da fare

**`pi` non va portato subito verso una “GraphRAG platform”. Va portato prima a essere un sistema affidabile di orchestrazione + memoria con evidenza.**  

La scelta corretta è questa:

1. **stabilizzare la base operativa**
2. **trasformare `third-brain` in un retrieval layer con trust**
3. **chiudere il loop Alfred ↔ memoria in modo automatico e query-aware**

In formula:

> Oggi `pi` è un buon embrione di memory system.  
> La prossima versione deve diventare un **knowledge operating substrate affidabile**.  
> Non più “ricorda cose”, ma “recupera cose giustificabili e le collega alle decisioni”.

---

## Le 3 direzioni di sviluppo, priorizzate

### 1: fatta

---

### 2) Evolvere `third-brain` in un retrieval layer con trust
**Priorità**: 2  
**Impatto**: massimo  
**Fattibilità tecnica**: media

Questa è la vera leva di qualità percepita.

#### Decisione
Non basta migliorare la search. Bisogna cambiare la natura della memoria:
- da vettoriale-associativa soltanto
- a **retrieval grounded, citabile, filtrabile e misurabile**

#### Cosa significa concretamente
Introdurre una **Dual Memory Architecture**:

**Evidence Layer**
- claim
- decisioni
- evidenze
- estratti da debate/documenti
- provenance forte
- supporti / contraddizioni / supersessioni

**Associative Layer**
- note
- intuizioni
- tensioni
- collegamenti semantici
- materiale fertile/non consolidato

#### Capacità da aggiungere
- metadati di provenienza (`source_uri`, `chunk_id`, `page/span`, `created_from_debate`, `created_by_agent`)
- retrieval ibrido: keyword + vector
- reranking dei candidati
- citations strutturate in output
- benchmark locale con metriche retrieval e grounding

#### Perché è la seconda priorità
Perché il gap più serio verso lo stato dell’arte non è l’assenza di clustering o GraphRAG. È il fatto che oggi il sistema:
- recupera
- ma non giustifica abbastanza
- e non misura la qualità del recupero

Finché manca trust, manca prodotto.

---

### 3) Rendere Alfred debate-native e introdurre un Query Compiler
**Priorità**: 3  
**Impatto**: alto  
**Fattibilità tecnica**: media

Qui c’è il salto distintivo, ma va fatto solo dopo i primi due.

#### Decisione
Alfred non deve restare solo un orchestratore di sottoprocessi.  
Deve diventare il **produttore strutturato di conoscenza decisionale**.

#### Cosa fare
Alla chiusura di `alfred_run`, il sistema deve produrre automaticamente:
- un **Debate Hub**
- claim atomici
- decisione finale
- alternative scartate
- conflitti irrisolti
- link a round, agenti, output e memoria derivata

Poi la query non va più trattata come una ricerca unica, ma come una strategia compilata:

- query semantiche → vector/hybrid
- query keyword-heavy → lexical/hybrid
- query relazionali → graph-aware traversal
- query storiche → timeline/debate retrieval
- query “cosa sappiamo davvero?” → evidence-only mode

#### Perché terza
Perché senza base stabile e retrieval con trust, l’auto-ingestion trasformerebbe in memoria strutturata anche il rumore.

---

## Roadmap

### Fase 1 — Stabilità obbligatoria
1. Unificare schema `.alfred`
2. Sistemare manifest team e sanitizzazione
3. Definire health policy: strict o degraded, ma esplicita
4. Aggiungere test minimi e regressioni
5. Riallineare docs e implementazione

**Exit criterion**: nessuna ambiguità su dove stanno team, debate, stato progetto e comportamento all’avvio.

---

### Fase 2 — Trust del retrieval
1. Estendere schema note con provenance
2. Separare Evidence Layer e Associative Layer
3. Aggiungere hybrid retrieval
4. Inserire reranking
5. Restituire citations strutturate
6. Costruire benchmark retrieval/grounding/latency

**Exit criterion**: ogni risposta importante può dire da dove viene e con quale livello di supporto.

---

### Fase 3 — Ciclo cognitivo completo
1. Hook automatico Alfred → Third Brain a fine debate
2. Generazione Debate Hub + claim + decisioni + conflitti
3. Rimozione o riduzione dei correlati casuali come default operativo
4. Introduzione del Query Compiler
5. Traversal graph-aware solo per classi di query che lo richiedono

**Exit criterion**: il sistema non dipende più da rituali manuali per trasformare un debate in conoscenza recuperabile.

---

## Chiusura netta

### Cosa NON fare adesso
- non costruire subito una GraphRAG totale
- non investire prima in clustering sofisticato
- non aumentare la complessità del retrieval senza benchmark
- non affidare ancora il loop di memoria a prompt e skill come meccanismo principale

### Cosa fare adesso
- **stabilizza**
- **dai provenance**
- **misura**
- **automatizza il passaggio debate → knowledge**

## Decisione finale

**La traiettoria giusta per `pi` è:**
> da orchestratore con memoria semantica  
> a sistema di conoscenza con evidenza, trust e decisioni tracciabili.

Se devo scegliere una sola frase operativa:

> **Prima rendete affidabile ciò che il sistema sa salvare e recuperare; poi rendetelo intelligente nel decidere cosa ricordare e come cercarlo.**

