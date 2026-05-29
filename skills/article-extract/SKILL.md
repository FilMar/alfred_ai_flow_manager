---
name: article-extract
description: Estrae il testo leggibile da un URL di articolo web (titolo + corpo, senza nav/ads/footer) e lo stampa a stdout. Usalo ogni volta che l'utente fornisce un link a un articolo, blog post, o pagina web e vuole leggerne o elaborarne il contenuto. Trigger = URL web generico, richieste come "estraimi l'articolo", "prendi il testo di questa pagina", "leggi questo link".
---

## Compito

Esegui lo script bundled passando l'URL come argomento. Stampa l'output a stdout senza modifiche.

```bash
python3 /home/filippo/.claude/skills/article-extract/scripts/extract.py "<URL>"
```

Se lo script fallisce (pagina non raggiungibile, contenuto non estraibile), mostra l'errore restituito senza inventare alternative.
