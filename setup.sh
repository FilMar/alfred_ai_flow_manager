#!/bin/bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
CLAUDE="$HOME/.claude"
PI="$HOME/.pi/agent"

link() {
    local src="$1" dst="$2" label="$3"
    if [[ -e "$dst" ]]; then
        echo "  [skip] $label already exists"
    else
        ln -s "$src" "$dst"
        echo "  [ok]   $label -> $src"
    fi
}

# --- identity ---
echo "identity (alfred.md)"
link "$REPO/alfred.md" "$CLAUDE/CLAUDE.md"  "~/.claude/CLAUDE.md"
link "$REPO/alfred.md" "$PI/SYSTEM.md"      "~/.pi/agent/SYSTEM.md"

# --- skills ---
echo "skills"
link "$REPO/skills" "$CLAUDE/skills" "~/.claude/skills"
link "$REPO/skills" "$PI/skills"     "~/.pi/agent/skills"

# --- tools (tb, th, td) ---
echo "tools (tb, th, td)"
cd "$REPO" && bun install --silent
echo "  [ok]   bun install done"
chmod +x "$REPO/tools/tb/src/cli.ts"
chmod +x "$REPO/tools/th/src/cli.ts"
chmod +x "$REPO/tools/td/src/cli.ts"
link "$REPO/tools/tb/src/cli.ts" "$HOME/.local/bin/tb" "~/.local/bin/tb"
link "$REPO/tools/th/src/cli.ts" "$HOME/.local/bin/th" "~/.local/bin/th"
link "$REPO/tools/td/src/cli.ts" "$HOME/.local/bin/td" "~/.local/bin/td"
