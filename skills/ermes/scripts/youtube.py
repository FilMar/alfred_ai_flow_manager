#!/usr/bin/env python3
"""Extract clean transcript from one or more YouTube URLs using youtube_transcript_api."""

import sys
import re
import time
import random
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import CouldNotRetrieveTranscript


def extract_video_id(url: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if not match:
        raise ValueError(f"URL non valido: {url}")
    return match.group(1)


def fetch_transcript(api: YouTubeTranscriptApi, url: str) -> str:
    video_id = extract_video_id(url)
    transcript = api.fetch(video_id, languages=["it", "en"])
    return " ".join(s.text for s in transcript.snippets)


def main():
    if len(sys.argv) < 2:
        print("Usage: extract.py <url> [url2 ...]", file=sys.stderr)
        sys.exit(1)

    urls = sys.argv[1:]
    api = YouTubeTranscriptApi()
    has_error = False

    for i, url in enumerate(urls):
        if len(urls) > 1:
            print(f"=== {url} ===")
        try:
            print(fetch_transcript(api, url))
        except (ValueError, CouldNotRetrieveTranscript) as e:
            print(f"ERRORE: {e}", file=sys.stderr)
            has_error = True
        if i < len(urls) - 1:
            time.sleep(random.uniform(0.5, 1.5))

    sys.exit(1 if has_error else 0)


if __name__ == "__main__":
    main()
