#!/usr/bin/env python3
"""Extract clean transcript from a YouTube URL using yt-dlp."""

import sys
import subprocess
import tempfile
import os
import re
import glob

def parse_vtt(filepath):
    with open(filepath, encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    seen = []
    for line in lines:
        line = line.strip()
        # Skip headers, timestamps, cue identifiers, empty lines
        if not line:
            continue
        if line.startswith("WEBVTT") or line.startswith("Kind:") or line.startswith("Language:"):
            continue
        if re.match(r"^\d{2}:\d{2}", line):  # timestamp
            continue
        if re.match(r"^\d+$", line):  # cue number
            continue
        # Strip HTML-like tags (e.g. <c>, </c>, <00:00:00.000>)
        line = re.sub(r"<[^>]+>", "", line).strip()
        if not line:
            continue
        # Deduplicate consecutive identical lines (auto-subs stutter)
        if seen and seen[-1] == line:
            continue
        seen.append(line)

    return " ".join(seen)

def main():
    if len(sys.argv) < 2:
        print("Usage: extract.py <youtube_url>", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]

    with tempfile.TemporaryDirectory() as tmpdir:
        output_template = os.path.join(tmpdir, "video.%(ext)s")
        # Try user-uploaded captions first, fall back to auto-generated
        for auto_flag in [[], ["--write-auto-subs"]]:
            cmd = [
                "yt-dlp",
                "--write-subs",
                *auto_flag,
                "--sub-format", "vtt",
                "--sub-langs", "it,en",
                "--skip-download",
                "--quiet",
                "-o", output_template,
                url,
            ]
            subprocess.run(cmd, check=False, capture_output=True)
            vtt_files = glob.glob(os.path.join(tmpdir, "*.vtt"))
            if vtt_files:
                break

        if not vtt_files:
            print("Nessun transcript disponibile per questo video.", file=sys.stderr)
            sys.exit(1)

        # Prefer Italian if available
        chosen = next((f for f in vtt_files if ".it." in f), vtt_files[0])
        print(parse_vtt(chosen))

if __name__ == "__main__":
    main()
