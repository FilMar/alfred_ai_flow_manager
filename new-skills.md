# Piano skill — architettura rivista (v2)

## Idea guida
Il sistema non deve pensare al posto dell'utente. Deve raccogliere, collegare, provocare e mantenere una memoria strutturata. L'intelligenza dell'AI serve a generare l'attrito necessario affinché la comprensione avvenga nel cervello umano, supportata da un'estensione digitale (`Third Brain`) e una storica (`Antinet`).

---

## 1. Alfredo: Il Regista Operativo
**Ruolo**: Orchestrazione pura e gestione del ciclo di vita del compito.

**Fa**:
- Riceve la richiesta e classifica il tipo di lavoro.
- Crea team di specialisti (combinando Hat + Skill) per risolvere il problema.
- Coordina l'esecuzione e sintetizza il risultato finale.
- **Trigger di chiusura**: Una volta completato il compito, attiva automaticamente `Platone`.

NB:  potrebbe controllare https://github.com/BehiSecc/awesome-claude-skills per individuare skill utili e proporne l'integrazione per un team member

**Non fa**:
- Non è il rituale serale.
- Non esegue il lavoro di estrazione concettuale in prima persona.

**Esito**: Il compito è risolto e il sistema ha innescato la fase di preservazione della conoscenza.

---

## 2. Platone: L'Accrescitore della Memoria
**Ruolo**: Estrattore di valore dal lavoro svolto.

**Missione**: Trasformare l'output di un task in asset di conoscenza, distinguendo tra valore sistemico e valore cognitivo.

**Operatività**:
1. **Estrazione Sistematica**: Identifica tutti i concetti che rispettano le regole (atomici, riusabili, non banali).
   - Li salva nel `Third Brain` come **conoscenza operativa del sistema** (materiale che l'AI può usare in futuro anche se l'utente non lo ha interiorizzato).
2. **Estrazione Selettiva**: Filtra i 1-2 concetti più "fertili" o controintuitivi.
   - Li presenta all'utente in un file di sintesi (es. `ideas.md`) come semi per la riflessione notturna.

**Regole di qualità**:
- **Atomicità**: Un concetto per nota.
- **Riusabilità**: Deve essere utile in contesti diversi da quello corrente.
- **Non banalità**: Non salvare ovvietà o passaggi procedurali triviali.
- **perche**: il perche' riguarda l'idea in se, non usare cose tipo: "l'operatore ha detto x"

**Esito**: Il `Third Brain` cresce in capacità operativa; l'utente riceve una selezione di spunti per il rituale serale.

---

## 3. Socrate: Il Provocatore (Elenchos)
**Ruolo**: Generatore di attrito cognitivo.

**Missione**: Dimostrare la fragilità di un'idea per costringere l'utente a una rielaborazione profonda tramite l'Antinet.

**Operatività**:
- Prende in input un'idea (proposta dall'utente).
- Interroga il `Third Brain` alla ricerca di contraddizioni, lacune o tensioni.
- Applica il metodo dell'*Elenchos*: non suggerisce soluzioni, ma formula la **domanda scomoda**.
- L'obiettivo è creare un punto di rottura che non possa essere risolto digitalmente, ma che richieda la consultazione dell'Antinet (i sé passati).

**Vincoli**:
- Non chiudere mai il ragionamento al posto dell'utente.
- No al "teatro verbale" o alla gentilezza da coach.
- Se emerge una domanda che mette in crisi il presupposto, fermarsi e consegnare quella.

**Esito**: L'utente è messo in tensione e spinto verso il ponte analogico.

---

## 4. Aristotele: Il Curatore della Sintesi
**Ruolo**: Codificatore della conoscenza elaborata.

**Missione**: Trasformare la risposta dell'utente (post-Antinet) in memoria raffinata e strutturata.

**Operatività**:
- Prende la risposta prodotta dall'utente dopo l'attrito socratico.
- La integra nel `Third Brain`, promuovendo il materiale da "operativo/grezzo" a **conoscenza personale elaborata**.
- Aggiorna i collegamenti, risolve le tensioni e cura la tassonomia.
- genera nuove note hub per cluster concettuali molto densi
- Restituisce una versione strutturata che può essere nuovamente messa alla prova da `Socrate`.

**Esito**: Il `Third Brain` non accumula solo dati, ma sedimenta comprensione reale.

---

## Pipeline e Flussi Operativi

### A. Il Flusso Diurno (Active/Operational)
`Utente` $\rightarrow$ `Alfredo` $\rightarrow$ `[Team Specialisti]` $\rightarrow$ `Soluzione` $\rightarrow$ `Platone` $\rightarrow$ `Third Brain` (+ 1-2 perle per l'utente).

### B. Il Flusso Serale (Ritual/Epistemic)
Un loop iterativo di raffinamento:
1. `Utente` $\rightarrow$ propone un'idea (o perla di Platone).
2. `Socrate` $\rightarrow$ interroga DB $\rightarrow$ formula domanda scomoda.
3. `Utente` $\rightarrow$ **Antinet (Carta)** $\rightarrow$ produce risposta risolutiva.
4. `Aristotele`(come sub-agents) $\rightarrow$ integra risposta nel DB $\rightarrow$ aggiorna statuto $\rightarrow$ raffina memoria.
5. `Socrate` $\rightarrow$ verifica se la tensione persiste $\rightarrow$ (Ripeti se necessario).




