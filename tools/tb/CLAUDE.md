# Third Brain — Coding Standards

## Architecture

Dependency direction (no circular imports):

```
cli.ts → notes.ts → qdrant.ts → infra.ts
                 ↘             ↗
                   types.ts
```

- **`infra.ts`** — HTTP client, config constants, client singletons, `embed()`, `checkHealth()`
- **`types.ts`** — pure types, enums, and pure functions (no I/O, no imports from other local files)
- **`qdrant.ts`** — Qdrant CRUD and search; no business logic
- **`notes.ts`** — business logic (create, update, search, browse); orchestrates qdrant + infra
- **`cli.ts`** — CLI surface only; no logic beyond parsing and formatting output

## Constants and config

All magic numbers and strings must be named constants. Location rules:

- **Config values** (URLs, timeouts, model names, collection name, limits) → `infra.ts`, exported
- **Algorithm-local values** (vocab size, traversal caps) → top of the file that uses them, unexported
- **CLI-local values** (poll retries, poll interval) → top of `cli.ts`, unexported

Never hardcode a value that is already defined as a constant elsewhere.

## Dead code

Exports that are never imported anywhere are dead. Delete them — don't comment them out, don't keep them "for future use". If a type, function, or constant is not used by at least one importer, remove it.

## DRY

Extract repeated logic into a private function at the top of the file. Examples applied:

- `createIndices()` in `qdrant.ts` — was copy-pasted twice in `ensureCollection()`
- `validateKind()` in `cli.ts` — used in `save`, `update`, `browse`
- `errorMessage()` in `cli.ts` — used in every `catch` block

## File size

Max ~400 lines per file. If a file grows past that, look for a coherent sub-responsibility to extract. Do not split arbitrarily — split on semantics.

Conversely, micro-files (< ~50 lines, single-purpose) should be merged into their closest logical neighbor rather than left as separate modules.

## Readability

- Section headers with `// ─── Name ─────` separators to visually group related code
- One exported responsibility per section
- Imports grouped: node built-ins → local files
- No comments that explain *what* the code does — only *why* when it's non-obvious
