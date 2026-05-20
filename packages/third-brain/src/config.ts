// ─── Configurazione via variabili d'ambiente ─────────────────────────────────
// Default: installazioni locali standard. Overridabili via env.

export const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

export const COLLECTION = "third-brain";
export const EMBED_MODEL = "nomic-embed-text";

/** Dimensione vettore di nomic-embed-text */
export const VECTOR_SIZE = 768;
