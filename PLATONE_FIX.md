# Correzione Skill: Platone (The Memory Increaser)

## Problema Rilevato: "The Process Trap"
È stato osservato che l'agente Platone tende a sedimentare nel Third Brain il **processo di arrivo** alla conclusione anziché la **conclusione stessa**. 
Le note risultano inquinate da riferimenti interni al debate (nomi di membri, colori dei cappelli, dinamiche di scontro/accordo), rendendo la conoscenza dipendente dal contesto temporale e relazionale della sessione, invece che semanticamente autonoma.

## Direttiva di Correzione: Purezza Semantica

Platone deve operare una separazione netta tra il **Flusso di Lavoro** (che rimane nei log del debate) e la **Memoria Persistente** (che deve essere agnostica rispetto al team).

### 1. Divieti Assoluti nel Salvataggio (Hard Constraints)
È vietato inserire nei campi `what` e `why` di `third_brain_save`:
- **Riferimenti Nominali**: Mai citare i nomi dei membri del team (es. "Sestilio", "Ugo", "Ermenegildo").
- **Riferimenti Cognitivi**: Mai citare i cappelli o i ruoli (es. "il Cappello Nero ha obiettato", "il precisista ha confermato").
- **Frammenti di Processo**: Eliminare espressioni come "Sintesi del debate", "Risultato della collisione tra X e Y", "Dopo la discussione è emerso che".
- **Riferimenti all'Utente**: Evitare "Come richiesto dall'utente", "In risposta alla domanda di Filippo".

### 2. Riconfigurazione del campo `why` (Il "Perché" Intrinseco)
Il campo `why` non deve descrivere *come* l'idea è nata, ma *perché* l'idea è rilevante a prescindere dal debate.

- **SBAGLIATO**: "Sintesi tra la visione di Ugo e la critica di Ermenegildo sulla potenza sistemica."
- **CORRETTO**: "Analisi della correlazione tra dipendenza tecnica e potere strategico in contesti di mercato frammentati."

### 3. Riconfigurazione del campo `what` (L'Idea Atomica)
Il campo `what` deve essere un'affermazione di valore, un assioma o un lemma che possa essere compreso tra dieci anni senza leggere i log della sessione.

- **SBAGLIATO**: "Sestilio ha concluso che il Shadow Loop è utile per evitare i bug citati da Neri."
- **CORRETTO**: "The Shadow Loop: Pattern di progettazione in cui un'istanza di validazione avversariale opera in parallelo all'esecuzione principale per forzare la resilienza del codice tramite l'identificazione sistematica di edge-case."

## Esempio Operativo di Trasformazione

**Input (Output del Debate):**
*"Dopo un acceso scontro tra il Cappello Bianco e il Rosso, Sestilio ha sintetizzato che l'uso di micro-agenti è meglio di un unico God-Agent perché riduce le allucinazioni."*

**Output (Salvataggio nel Third Brain):**
- **what**: Granularità Agentica: La scomposizione di un'intelligenza complessa in micro-agenti specializzati riduce la probabilità di allucinazioni sistemiche migliorando il determinismo dell'output.
- **why**: Fondamentale per l'architettura di sistemi agentici ad alta affidabilità dove l'errore di un singolo modello non deve compromettere l'intera pipeline.

## Verifica di Conformità
Prima di ogni chiamata a `third_brain_save`, Platone deve porsi una domanda:
*"Se eliminassi l'intero storico di questa sessione e leggessi solo questa nota, capirei il valore del concetto senza chiedermi chi lo abbia detto?"*
$\rightarrow$ Se la risposta è **NO**, la nota va riscritta.
