import { qdrantClient, ollamaClient } from "./clients.js";
import { QDRANT_URL, OLLAMA_URL, EMBED_MODEL } from "./config.js";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  qdrant: boolean;
  ollama: boolean;
  /** nomic-embed-text è presente in Ollama */
  model: boolean;
}

const HEALTH_CHECK_TTL_MS = 60_000;
let cachedHealth: HealthStatus | null = null;
let lastHealthCheckTime = 0;

// ─── Check ───────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<HealthStatus> {
  const status: HealthStatus = { qdrant: false, ollama: false, model: false };

  // Qdrant — .fetch() per non lanciare su non-ok (es. 404 in avvio a freddo)
  try {
    const res = await qdrantClient.fetch("GET", "/");
    status.qdrant = res.ok;
  } catch {
    // non raggiungibile
  }

  // Ollama + modello
  try {
    const data = await ollamaClient.request<{ models?: { name: string }[] }>(
      "GET",
      "/api/tags",
    );
    status.ollama = true;
    status.model = (data.models ?? []).some((m) => m.name.startsWith(EMBED_MODEL));
  } catch {
    // non raggiungibile
  }

  return status;
}

export async function getHealthCached(): Promise<HealthStatus> {
  const now = Date.now();
  if (cachedHealth && now - lastHealthCheckTime < HEALTH_CHECK_TTL_MS) {
    return cachedHealth;
  }

  cachedHealth = await checkHealth();
  lastHealthCheckTime = now;
  return cachedHealth;
}

export function missingServices(status: HealthStatus, options?: { needsEmbedding?: boolean }): string[] {
  const needsEmbedding = options?.needsEmbedding ?? true;
  return [
    !status.qdrant ? "Qdrant" : null,
    needsEmbedding && !status.ollama ? "Ollama" : null,
    needsEmbedding && !status.model ? `modello ${EMBED_MODEL}` : null,
  ].filter((value): value is string => value !== null);
}

export function fixCommands(status: HealthStatus, options?: { needsEmbedding?: boolean }): string[] {
  const needsEmbedding = options?.needsEmbedding ?? true;
  return [
    !status.qdrant ? "docker run -p 6333:6333 qdrant/qdrant" : null,
    needsEmbedding && !status.ollama ? "ollama serve" : null,
    needsEmbedding && !status.model ? `ollama pull ${EMBED_MODEL}` : null,
  ].filter((value): value is string => value !== null);
}

// ─── Warning ─────────────────────────────────────────────────────────────────

export function warnIfUnhealthy(status: HealthStatus): void {
  if (status.qdrant && status.ollama && status.model) return;

  console.warn("\n[third-brain] Attenzione: servizi mancanti.\n");

  if (!status.qdrant) {
    console.warn(`  Qdrant non raggiungibile (${QDRANT_URL})`);
    console.warn("  → docker run -p 6333:6333 qdrant/qdrant\n");
  }

  if (!status.ollama) {
    console.warn(`  Ollama non raggiungibile (${OLLAMA_URL})`);
    console.warn("  → ollama serve\n");
  } else if (!status.model) {
    console.warn(`  Modello '${EMBED_MODEL}' non trovato in Ollama.`);
    console.warn(`  → ollama pull ${EMBED_MODEL}\n`);
  }
}
