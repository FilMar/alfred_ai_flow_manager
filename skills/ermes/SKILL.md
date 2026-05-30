---
name: ermes
description: "Ermes estrae testo leggibile da qualsiasi fonte esterna: articoli web (titolo + corpo, senza nav/ads/footer) e video YouTube (transcript). Usalo ogni volta che l'utente fornisce un URL e vuole leggerne o elaborarne il contenuto. Trigger = qualsiasi URL esterno, richieste come 'estraimi l'articolo', 'leggi questo link', 'cosa dice questo video', 'prendi il testo di questa pagina', 'trascrivimi questo video'."
---

## Compito

Determina il tipo di URL e usa lo script corretto.

**YouTube** (URL contiene `youtube.com` o `youtu.be`):
```bash
python3 /home/filippo/git_projects/pi/skills/ermes/scripts/youtube.py "<URL1>" "<URL2>" ...
```
Supporta più URL in una sola chiamata. Se un video fallisce, lo script riporta l'errore e continua con gli altri.

**Articolo web** (qualsiasi altro URL):
```bash
python3 /home/filippo/git_projects/pi/skills/ermes/scripts/article.py "<URL>"
```

Stampa l'output a stdout senza modifiche. Se lo script fallisce, mostra l'errore senza inventare alternative.
