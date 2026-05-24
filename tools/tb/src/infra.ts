// ─── HTTP client ─────────────────────────────────────────────────────────────

export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class HttpClient {
  constructor(private readonly config: HttpClientConfig) {}

  // Ritorna la Response grezza senza lanciare su non-ok.
  async fetch(method: string, path: string, body?: unknown): Promise<Response> {
    return globalThis.fetch(`${this.config.baseUrl}${path}`, {
      method,
      signal: AbortSignal.timeout(this.config.timeout ?? 10_000),
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  // Lancia HttpError se la risposta non è ok.
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetch(method, path, body);
    if (!res.ok) {
      const text = await res.text();
      throw new HttpError(`${res.status} ${text.slice(0, 200)}`, res.status);
    }
    return res.json() as Promise<T>;
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────

export const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

export const COLLECTION = "third-brain";
export const EMBED_MODEL = "nomic-embed-text";
export const VECTOR_SIZE = 768;
export const DENSE_VECTOR_NAME = "dense";
export const SPARSE_VECTOR_NAME = "sparse";

export const QDRANT_TIMEOUT_MS = 5_000;
export const OLLAMA_TIMEOUT_MS = 30_000;
export const SNIPPET_MAX_LEN = 200;
export const REFS_LIMIT = 6;

// ─── Client instances ─────────────────────────────────────────────────────────

export const qdrantClient = new HttpClient({ baseUrl: QDRANT_URL, timeout: QDRANT_TIMEOUT_MS });
export const ollamaClient = new HttpClient({ baseUrl: OLLAMA_URL, timeout: OLLAMA_TIMEOUT_MS });

// ─── Embed ───────────────────────────────────────────────────────────────────

// Input atteso: `why + "\n\n" + what`
export async function embed(text: string): Promise<number[]> {
  const data = await ollamaClient.request<{ embeddings: number[][] }>(
    "POST",
    "/api/embed",
    { model: EMBED_MODEL, input: text },
  );
  const vector = data.embeddings[0];
  if (!vector || vector.length !== VECTOR_SIZE) {
    throw new Error(
      `Ollama returned invalid embedding: expected ${VECTOR_SIZE} dimensions, got ${vector?.length ?? 0}. ` +
      `Check that model '${EMBED_MODEL}' is correct.`,
    );
  }
  return vector;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthStatus {
  qdrant: boolean;
  ollama: boolean;
  model: boolean;
}

export async function checkHealth(): Promise<HealthStatus> {
  const status: HealthStatus = { qdrant: false, ollama: false, model: false };

  try {
    const res = await qdrantClient.fetch("GET", "/");
    status.qdrant = res.ok;
  } catch {
    // non raggiungibile
  }

  try {
    const data = await ollamaClient.request<{ models?: { name: string }[] }>("GET", "/api/tags");
    status.ollama = true;
    status.model = (data.models ?? []).some((m) => m.name.startsWith(EMBED_MODEL));
  } catch {
    // non raggiungibile
  }

  return status;
}
