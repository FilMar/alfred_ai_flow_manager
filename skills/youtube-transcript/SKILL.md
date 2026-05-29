---
name: youtube-transcript
description: Estrae il transcript testuale da un URL YouTube e lo stampa a stdout. Usalo ogni volta che l'utente fornisce un link YouTube e vuole leggere, analizzare o elaborare il contenuto parlato del video. Trigger = URL youtube.com o youtu.be, richieste come "estraimi il transcript", "cosa dice questo video", "prendi il testo di questo video".
---

## Compito

Esegui lo script bundled passando l'URL come argomento. Stampa l'output a stdout senza modifiche.

```bash
python3 /home/filippo/.claude/skills/youtube-transcript/scripts/extract.py "<URL>"
```

Se lo script fallisce (video senza sottotitoli, URL non valido), mostra l'errore restituito dallo script senza inventare alternative.
