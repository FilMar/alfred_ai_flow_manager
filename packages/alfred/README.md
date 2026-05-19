# Alfred π (`pi-alfred`)

Alfred π è un'estensione per [pi](https://github.com/badlogic/pi-mono) che trasforma l'assistente in un project manager di intelligenze distribuite. Invece di affidarsi a un singolo agente generalista, Alfred assembla team di specialisti con identità cognitive distinte, li fa ragionare insieme su un problema e ne sintetizza il pensiero.

L'obiettivo è avere **dipendenti digitali**: assegni un progetto, discuti un problema, ricevi prospettive radicalmente diverse che si sfidano e si raffinano a vicenda.

---

## Come funziona

Alfred è una **skill** (o set di skill) iniettata nel sistema prompt di pi. Non è un agente separato: è il modo in cui pi diventa Alfred — con una personalità precisa, la conoscenza dei team disponibili e la capacità di orchestrare sessioni di lavoro collettivo.

Quando riceve un task, Alfred:
1. Sceglie il team più adatto tra quelli disponibili nel progetto
2. Decide il flow di esecuzione in base al tipo di task
3. Apre un **debate**: un thread condiviso che gli agenti leggono e a cui contribuiscono
4. Sintetizza il risultato e lo presenta all'utente

L'utente parla con Alfred. Alfred parla con il team. Ma è possibile indirizzare un singolo membro direttamente (`@critic cosa pensi di questo approccio?`).

---

## Architettura Cognitiva

L'efficacia di un agente non deriva solo dal modello LLM, ma dall'identità che gli viene assegnata. Ogni membro del team è definito da strati sovrapposti:

| Strato | Descrizione |
|--------|-------------|
| **Cappello (Core)** | Modalità cognitiva — definisce *come* l'agente elabora le informazioni |
| **Ruolo** | La professione (es. "Senior Backend Developer") |
| **Personalità** | Descrizione breve che fonde cappello e ruolo nel contesto del team |
| **Tools** | Lista minimale di strumenti consentiti |
| **Skills** | Skill pi che l'agente può usare |
| **maxToolCalls** | Limite hard di chiamate a tool per turno |
| **Model** | Il modello LLM assegnato |

### I Cappelli di De Bono

I cappelli sono **protocolli cognitivi**, non personalità generiche. Ogni cappello definisce tecniche specifiche, gotcha espliciti e un formato di output strutturato.

| Cappello | Modalità | Tecnica chiave |
|----------|----------|----------------|
| `white-core` | Dati, fatti, oggettività | Fact extraction, gap mapping |
| `red-core` | Intuito, emozioni, pattern | Gut feeling analysis, weak signals |
| `black-core` | Rischio, critica, worst-case | Assumption hunting, stress-testing |
| `yellow-core` | Ottimismo, valore, opportunità | Value leverage, upside analysis |
| `green-core` | Creatività, alternative, divergenza | Provocazione (Po), inversione, analogia |
| `blue-core` | Sintesi, meta-cognizione, decisione | Orchestrazione interna, sintesi dialettica |

Il `blue-core` è un potenziale membro del team — non Alfred. Il suo ruolo dall'interno di un debate è mantenere il focus, orchestrare i turni e chiudere la discussione con una decisione concreta.

---

## Struttura del Progetto

Ogni progetto ha una cartella `.alfred/` nella propria root:

```
.alfred/
  alfred_project.json      ← metadata, team attivi, configurazione
  teams/
    programmers/
      manifest.json        ← definizione del team
    ux-designers/
      manifest.json
  debates/
    2026-05-19_feature-auth/
      thread.md            ← conversazione in crescita (tutti i contributi)
      summary.md           ← sintesi finale di Alfred
```

### `alfred_project.json`

```json
{
  "name": "nome-progetto",
  "description": "Descrizione del progetto",
  "teams": ["programmers", "ux-designers"],
  "created": "2026-05-19"
}
```

### `teams/<name>/manifest.json`

```json
{
  "name": "programmers",
  "description": "Team backend per feature development",
  "members": [
    {
      "id": "senior-critic",
      "hat": "black-core",
      "role": "Senior Backend Developer",
      "personality": "Smonta architetture fragili con la precisione di chi ha visto troppi sistemi in produzione collassare.",
      "model": "claude-sonnet-4-6",
      "tools": ["read", "bash", "grep", "find"],
      "skills": [],
      "maxToolCalls": 15
    },
    {
      "id": "architect",
      "hat": "yellow-core",
      "role": "Software Architect",
      "personality": "Trova il design che massimizza il valore a lungo termine senza sacrificare la semplicità presente.",
      "model": "claude-sonnet-4-6",
      "tools": ["read", "grep", "find"],
      "skills": [],
      "maxToolCalls": 10
    }
  ]
}
```

I team globali riusabili (da importare nei progetti) vivono in `~/.pi/alfred/teams/`.

---

## I Flow di Esecuzione

Alfred sceglie il flow in base al task. Non esiste un flow fisso.

| Flow | Quando usarlo | Comportamento |
|------|---------------|---------------|
| `parallel` | Opinioni indipendenti su un problema | Tutti gli agenti leggono il task e rispondono in parallelo |
| `sequential` | Pipeline strutturata (es. ricerca → piano → implementazione) | Output di A diventa input di B |
| `roundtable` | Brainstorming, decisioni complesse | Round-robin, ogni agente vede le risposte degli altri e reagisce |
| `hybrid` | Feature development con review | Gruppi sequenziali con passi paralleli interni |

**Esempio:**
- *"Che mi consigliate su questo problema UI?"* → `parallel` con 2 esperti UX
- *"Sviluppa questa feature"* → `sequential`: researcher → planner → worker → reviewer
- *"Come gestiamo questo trade-off architetturale?"* → `roundtable` con blue-core come membro

---

## Il Thread: come parlano gli agenti

Ogni debate produce un `thread.md` che cresce durante la sessione. Ogni contributo è attribuito e strutturato secondo il formato del cappello del membro.

Poiché ogni cappello ha un **output format distinto** (sezioni markdown definite nel file del cappello), il contributo di ogni agente è immediatamente riconoscibile senza bisogno di prefissi artificiali.

Un agente che risponde nel thread vede sempre:
1. Il task originale
2. Tutti i contributi precedenti (con attribuzione)
3. La propria identità (hat + role + personality)

---

## Roadmap

- [x] Schema dati — tipi TypeScript rigidi: `HatId`, `ToolId`, `TeamMember`, `Team`, `AlfredProject`, `Flow`, `Debate`
- [x] Flow engine — parallel, sequential, roundtable (array annidato, nessun enum)
- [x] Tool `alfred_run` — lancia un debate, esegue il flow, salva thread + debate.json
- [x] Tool `alfred_teams` — lista team disponibili o ispeziona i membri di un team
- [x] Tool `alfred_init` — inizializza la struttura `.alfred/` in un progetto
- [x] Tool `alfred_team_create` — aggiunge un team con i suoi membri a un progetto esistente
- [x] Spawn engine — materializza ogni turno come processo `pi` figlio con hat + role + personality iniettati
- [x] Persistenza debate — `thread.md` + `summary.md` + `debate.json` in `.alfred/debates/<id>/`
- [x] Skill di Alfred — identity, orchestration protocol, flow design guide (`skills/alfred/SKILL.md`)
- [x] Team di esempio — creato via `alfred_init` + `alfred_team_create` (zero file scritti a mano)
- [x] Indirizzamento diretto `@member-id` — Alfred lancia `alfred_run` con flow a singolo membro
- ~~Comandi `/alfred-new-project`, `/alfred-debate`~~ — ridondanti con la skill attiva
- [ ] Evoluzione del team — feedback post-debate che raffina `personality` e config nel manifest

---

## Installazione

```bash
# Da repository git
pi install git:https://github.com/filmar/alfred-pi

# Sviluppo locale (dalla root del repo)
pi install .
```
