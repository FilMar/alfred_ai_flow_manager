#!/usr/bin/env python3
"""Extract clean article text from a URL using trafilatura."""

import sys
import trafilatura

def main():
    if len(sys.argv) < 2:
        print("Usage: extract.py <url>", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]
    html = trafilatura.fetch_url(url)

    if not html:
        print(f"Impossibile scaricare la pagina: {url}", file=sys.stderr)
        sys.exit(1)

    text = trafilatura.extract(
        html,
        url=url,
        include_comments=False,
        include_tables=True,
        favor_recall=True,
        with_metadata=True,
        output_format="txt",
    )

    if not text:
        print("Nessun contenuto estraibile dalla pagina.", file=sys.stderr)
        sys.exit(1)

    print(text)

if __name__ == "__main__":
    main()
