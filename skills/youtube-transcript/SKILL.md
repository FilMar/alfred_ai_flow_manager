---
name: youtube-transcript
description: Estrae il transcript testuale da uno o più URL YouTube e lo stampa a stdout. Usalo ogni volta che l'utente fornisce uno o più link YouTube e vuole leggere, analizzare o elaborare il contenuto parlato del video. Trigger = URL youtube.com o youtu.be, richieste come "estraimi il transcript", "cosa dice questo video", "prendi il testo di questo video", "trascrivimi questi video".
---

## Compito

Esegui lo script bundled passando uno o più URL come argomenti. Stampa l'output a stdout senza modifiche.

```bash
python3 /home/filippo/.claude/skills/youtube-transcript/scripts/extract.py "<URL1>" "<URL2>" ...
```

Se uno o più video falliscono (sottotitoli disabilitati, URL non valido), lo script riporta l'errore per quel video e continua con gli altri.
